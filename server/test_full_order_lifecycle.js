import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const API_BASE_URL = process.env.TEST_API_BASE_URL || "http://localhost:8000/api/v1";
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

const http = axios.create({
    baseURL: API_BASE_URL,
    timeout: 25000,
    validateStatus: () => true,
});

const pretty = (value) => JSON.stringify(value, null, 2);

const assertStatus = (res, allowedStatuses, context) => {
    if (!allowedStatuses.includes(res.status)) {
        throw new Error(
            `${context} failed with status ${res.status}\nResponse: ${pretty(res.data)}`,
        );
    }
};

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const idempotencyKey = (prefix) =>
    `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const login = async () => {
    if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
        throw new Error(
            "Set TEST_USER_EMAIL and TEST_USER_PASSWORD in server/.env to run this script.",
        );
    }

    const res = await http.post("/users/login", {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
    });

    assertStatus(res, [200], "Login");

    const token = res.data?.data?.accessToken;
    if (!token) {
        throw new Error(`Login succeeded but access token missing: ${pretty(res.data)}`);
    }

    return token;
};

const ensureAddress = async (token) => {
    const res = await http.get("/addresses", {
        headers: authHeaders(token),
    });
    assertStatus(res, [200], "Fetch addresses");

    const addresses = Array.isArray(res.data?.data) ? res.data.data : [];
    if (!addresses.length) {
        throw new Error("No address found. Please add an address before running the test.");
    }

    return addresses[0]._id;
};

const ensureCartHasItems = async (token) => {
    const cartRes = await http.get("/cart", {
        headers: authHeaders(token),
    });
    assertStatus(cartRes, [200], "Fetch cart");

    const cartItems = cartRes.data?.data?.items || [];
    if (cartItems.length > 0) {
        return;
    }

    const booksRes = await http.get("/books", {
        params: { page: 1, limit: 1 },
    });
    assertStatus(booksRes, [200], "Fetch books");

    const books = booksRes.data?.data?.items || booksRes.data?.data || [];
    const firstBook = Array.isArray(books) ? books[0] : null;

    if (!firstBook?._id) {
        throw new Error("No books available to seed cart.");
    }

    const addRes = await http.post(
        "/cart/add",
        { bookId: firstBook._id, quantity: 1 },
        { headers: authHeaders(token) },
    );
    assertStatus(addRes, [200], "Add item to cart");
};

const createOrder = async ({ token, addressId, paymentMethod }) => {
    await ensureCartHasItems(token);

    const res = await http.post(
        "/orders",
        {
            addressId,
            paymentMethod,
            idempotencyKey: idempotencyKey(`order_${paymentMethod.toLowerCase()}`),
        },
        { headers: authHeaders(token) },
    );

    assertStatus(res, [201], `Create ${paymentMethod} order`);

    const order = res.data?.data?.order;
    if (!order?._id) {
        throw new Error(`Order response malformed: ${pretty(res.data)}`);
    }

    return order;
};

const getOrderById = async (token, orderId) => {
    const res = await http.get(`/orders/${orderId}`, {
        headers: authHeaders(token),
    });
    assertStatus(res, [200], "Fetch order by id");

    const order = res.data?.data?.order;
    if (!order?._id) {
        throw new Error(`Order detail malformed: ${pretty(res.data)}`);
    }

    return order;
};

const createPaymentIntent = async (token, orderId) => {
    const res = await http.post(
        "/payments/create-intent",
        {
            orderId,
            idempotencyKey: idempotencyKey("intent"),
        },
        { headers: authHeaders(token) },
    );

    assertStatus(res, [201], "Create payment intent");

    const intent = res.data?.data;
    if (!intent?.razorpayOrderId) {
        throw new Error(`Intent response malformed: ${pretty(res.data)}`);
    }

    return intent;
};

const markPaymentFailure = async (token, razorpayOrderId, reason) => {
    const res = await http.post(
        "/payments/failure",
        {
            razorpayOrderId,
            reason,
        },
        { headers: authHeaders(token) },
    );

    assertStatus(res, [200], "Mark payment failure");
};

const triggerWebhookFailure = async (razorpayOrderId) => {
    if (!WEBHOOK_SECRET) {
        console.log("[SKIP] Webhook test skipped. Set RAZORPAY_WEBHOOK_SECRET to run it.");
        return false;
    }

    const eventId = `evt_${Date.now()}`;
    const payload = {
        event: "payment.failed",
        payload: {
            payment: {
                entity: {
                    id: `pay_mock_${Date.now()}`,
                    order_id: razorpayOrderId,
                    error_description: "Simulated webhook failure",
                },
            },
        },
    };

    const body = JSON.stringify(payload);
    const signature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(body)
        .digest("hex");

    const res = await http.post("/payments/webhook", payload, {
        headers: {
            "x-razorpay-signature": signature,
            "x-razorpay-event-id": eventId,
        },
    });

    assertStatus(res, [200], "Webhook failure simulation");

    const duplicateRes = await http.post("/payments/webhook", payload, {
        headers: {
            "x-razorpay-signature": signature,
            "x-razorpay-event-id": eventId,
        },
    });

    assertStatus(duplicateRes, [200], "Duplicate webhook simulation");
    return true;
};

const maybeVerifyCapturedPayment = async (token, fallbackRazorpayOrderId) => {
    const razorpayOrderId =
        process.env.TEST_RAZORPAY_ORDER_ID || fallbackRazorpayOrderId;
    const razorpayPaymentId = process.env.TEST_RAZORPAY_PAYMENT_ID;
    const razorpaySignature = process.env.TEST_RAZORPAY_SIGNATURE;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        console.log(
            "[SKIP] Verify-payment test skipped. Provide TEST_RAZORPAY_ORDER_ID, TEST_RAZORPAY_PAYMENT_ID, TEST_RAZORPAY_SIGNATURE for a captured payment.",
        );
        return;
    }

    const res = await http.post(
        "/payments/verify",
        {
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature,
        },
        { headers: authHeaders(token) },
    );

    assertStatus(res, [200], "Verify captured payment");
    console.log("[PASS] Verify endpoint accepted captured payment payload.");
};

const main = async () => {
    console.log(`Running Razorpay flow test against ${API_BASE_URL}`);

    const token = await login();
    console.log("[PASS] Authenticated test user.");

    const addressId = await ensureAddress(token);
    console.log(`[PASS] Address ready: ${addressId}`);

    const codOrder = await createOrder({ token, addressId, paymentMethod: "COD" });
    const codOrderLatest = await getOrderById(token, codOrder._id);
    console.log(
        `[PASS] COD order ${codOrder._id} | paymentStatus=${codOrderLatest.paymentStatus} | orderStatus=${codOrderLatest.orderStatus}`,
    );

    const onlineOrder = await createOrder({
        token,
        addressId,
        paymentMethod: "ONLINE",
    });
    console.log(`[PASS] ONLINE order created: ${onlineOrder._id}`);

    const intent = await createPaymentIntent(token, onlineOrder._id);
    console.log(
        `[PASS] Intent created | razorpayOrderId=${intent.razorpayOrderId} | amount=${intent.amount}`,
    );

    await markPaymentFailure(
        token,
        intent.razorpayOrderId,
        "Simulated failure from full-flow script",
    );
    const failedOrder = await getOrderById(token, onlineOrder._id);
    console.log(
        `[PASS] Failure flow | paymentStatus=${failedOrder.paymentStatus} | orderStatus=${failedOrder.orderStatus}`,
    );

    const webhookExecuted = await triggerWebhookFailure(intent.razorpayOrderId);
    if (webhookExecuted) {
        console.log("[PASS] Webhook signature + duplicate event handling validated.");
    }

    await maybeVerifyCapturedPayment(token, intent.razorpayOrderId);

    console.log("Razorpay lifecycle test script completed.");
};

main().catch((error) => {
    console.error("Razorpay lifecycle test failed:");
    console.error(error.message || error);
    process.exitCode = 1;
});
