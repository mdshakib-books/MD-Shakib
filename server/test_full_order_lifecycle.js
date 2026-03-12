import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";

import Order from "./src/models/order.model.js";
import Payment from "./src/models/payment.model.js";
import Book from "./src/models/book.model.js";

dotenv.config({ path: "./.env" });

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 8000}/api/v1`;

const CREDENTIALS = {
    admin: {
        email: "arifquerry@gmail.com",
        password: "Arry00@",
    },
    user: {
        email: "mauryaanushka089@gmail.com",
        password: "Arry00@#",
    },
};

const report = {
    metadata: {
        startedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        runTag: `e2e-${Date.now()}`,
    },
    lifecycle: [],
    edgeCases: [],
    verificationPoints: [],
    observations: [],
    executionNotes: [],
};

const sectionIcons = {
    PASS: "✅",
    FAIL: "❌",
    WARN: "⚠️",
    BLOCKED: "⛔",
};

function record(section, name, status, expected, actual, evidence = {}) {
    const item = {
        name,
        status,
        expected,
        actual,
        evidence,
        at: new Date().toISOString(),
    };
    report[section].push(item);
    console.log(
        `${sectionIcons[status] || "•"} [${section}] ${name}\n   expected: ${expected}\n   actual:   ${actual}\n`,
    );
    return item;
}

function unwrapData(res) {
    if (!res?.json) return null;
    if (Object.prototype.hasOwnProperty.call(res.json, "data")) return res.json.data;
    return res.json;
}

function messageFrom(res) {
    if (res?.json?.message) return String(res.json.message);
    if (res?.text) return String(res.text);
    return "";
}

async function api(
    endpoint,
    { method = "GET", token = null, body = undefined, headers = {} } = {},
) {
    const reqHeaders = { ...headers };
    if (body !== undefined) reqHeaders["Content-Type"] = "application/json";
    if (token) reqHeaders.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }

    return {
        ok: res.ok,
        status: res.status,
        text,
        json,
    };
}

async function login(email, password, roleLabel) {
    const res = await api("/users/login", {
        method: "POST",
        body: { email, password },
    });

    if (!res.ok) {
        throw new Error(
            `${roleLabel} login failed (${res.status}): ${messageFrom(res)}`,
        );
    }

    const data = unwrapData(res);
    return {
        token: data?.accessToken,
        user: data?.user,
    };
}

async function getOrCreateAddress(userToken, runTag) {
    const res = await api("/addresses", { token: userToken });
    if (!res.ok) {
        throw new Error(`Failed to fetch addresses: ${messageFrom(res)}`);
    }
    const data = unwrapData(res);
    const list = Array.isArray(data) ? data : [];

    if (list.length > 0) {
        const defaultAddress = list.find((a) => a.isDefault);
        return defaultAddress?._id || list[0]._id;
    }

    const createRes = await api("/addresses", {
        method: "POST",
        token: userToken,
        body: {
            fullName: `E2E User ${runTag}`,
            phone: "9999999999",
            pincode: "110001",
            state: "Delhi",
            city: "New Delhi",
            houseNo: "A-1",
            area: "Connaught Place",
            landmark: "E2E Landmark",
            isDefault: true,
        },
    });

    if (!createRes.ok) {
        throw new Error(`Failed to create address: ${messageFrom(createRes)}`);
    }

    return unwrapData(createRes)?._id;
}

async function prepareCart(userToken, bookId, quantity = 1) {
    const clearRes = await api("/cart/clear", {
        method: "DELETE",
        token: userToken,
    });
    if (!clearRes.ok) {
        throw new Error(`Failed to clear cart: ${messageFrom(clearRes)}`);
    }

    const addRes = await api("/cart/add", {
        method: "POST",
        token: userToken,
        body: { bookId, quantity },
    });
    if (!addRes.ok) {
        throw new Error(`Failed to add item to cart: ${messageFrom(addRes)}`);
    }
}

async function placeOrder(userToken, addressId, paymentMethod, idempotencyKey) {
    const res = await api("/orders", {
        method: "POST",
        token: userToken,
        body: { addressId, paymentMethod, idempotencyKey },
    });
    return res;
}

async function fetchUserOrder(userToken, orderId) {
    const res = await api(`/orders/${orderId}`, { token: userToken });
    if (!res.ok) return { ok: false, order: null, payment: null, res };
    const data = unwrapData(res);
    return {
        ok: true,
        order: data?.order || null,
        payment: data?.payment || null,
        res,
    };
}

async function fetchAdminOrder(adminToken, orderId) {
    const res = await api(`/admin/orders/${orderId}`, { token: adminToken });
    if (!res.ok) return { ok: false, order: null, res };
    return { ok: true, order: unwrapData(res), res };
}

async function fetchAdminOrders(adminToken, limit = 100) {
    const res = await api(`/admin/orders?limit=${limit}&sort=-createdAt`, {
        token: adminToken,
    });
    if (!res.ok) return { ok: false, items: [], res };

    const data = unwrapData(res);
    const items = Array.isArray(data) ? data : data?.items || [];
    return { ok: true, items, res };
}

async function assertMirrorStatus(orderId, expectedStatus, userToken, adminToken, label) {
    const [userView, adminView, adminList] = await Promise.all([
        fetchUserOrder(userToken, orderId),
        fetchAdminOrder(adminToken, orderId),
        fetchAdminOrders(adminToken, 200),
    ]);

    const listOrder = adminList.items.find((o) => o._id === orderId);
    const userStatus = userView.order?.orderStatus;
    const adminStatus = adminView.order?.orderStatus;
    const listStatus = listOrder?.orderStatus;

    const allMatch =
        userStatus === expectedStatus &&
        adminStatus === expectedStatus &&
        listStatus === expectedStatus;

    record(
        "verificationPoints",
        `${label} reflected on user/admin pages`,
        allMatch ? "PASS" : "FAIL",
        `User + Admin detail + Admin list status should be "${expectedStatus}"`,
        `user=${userStatus}, admin=${adminStatus}, adminList=${listStatus}`,
        { orderId },
    );
}

async function updateStatus(adminToken, orderId, status) {
    return api(`/admin/orders/${orderId}/status`, {
        method: "PATCH",
        token: adminToken,
        body: { status },
    });
}

function ensureHistoryChronology(statusHistory = []) {
    if (!Array.isArray(statusHistory) || statusHistory.length === 0) return false;
    for (let i = 0; i < statusHistory.length; i += 1) {
        const current = new Date(statusHistory[i].timestamp).getTime();
        if (Number.isNaN(current)) return false;
        if (i > 0) {
            const prev = new Date(statusHistory[i - 1].timestamp).getTime();
            if (current < prev) return false;
        }
    }
    return true;
}

async function run() {
    let userToken = "";
    let adminToken = "";
    let addressId = "";
    let bookId = "";

    const primary = {
        codOrderId: null,
        onlineOrderId: null,
        onlinePaymentId: null,
    };

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        report.executionNotes.push("MongoDB connection established for DB-level assertions.");

        const book = await Book.findOne({ isActive: true, stock: { $gte: 1 } })
            .sort({ stock: -1 })
            .lean();
        if (!book) {
            throw new Error("No active book with sufficient stock found for E2E test.");
        }
        bookId = String(book._id);
        report.metadata.bookId = bookId;

        const userAuth = await login(
            CREDENTIALS.user.email,
            CREDENTIALS.user.password,
            "User",
        );
        const adminAuth = await login(
            CREDENTIALS.admin.email,
            CREDENTIALS.admin.password,
            "Admin",
        );
        userToken = userAuth.token;
        adminToken = adminAuth.token;

        report.metadata.userId = userAuth.user?._id;
        report.metadata.adminId = adminAuth.user?._id;

        record(
            "lifecycle",
            "User login",
            userToken ? "PASS" : "FAIL",
            "User should authenticate",
            userToken ? "Authenticated" : "Authentication failed",
            { email: CREDENTIALS.user.email },
        );

        record(
            "lifecycle",
            "Admin login",
            adminToken ? "PASS" : "FAIL",
            "Admin should authenticate",
            adminToken ? "Authenticated" : "Authentication failed",
            { email: CREDENTIALS.admin.email },
        );

        addressId = await getOrCreateAddress(userToken, report.metadata.runTag);
        report.metadata.addressId = addressId;

        // 1) COD order placement
        const codKey = crypto.randomUUID();
        await prepareCart(userToken, bookId, 1);
        const codOrderRes = await placeOrder(userToken, addressId, "COD", codKey);
        const codData = unwrapData(codOrderRes);
        primary.codOrderId = codData?.order?._id;

        record(
            "lifecycle",
            "User placed COD order",
            codOrderRes.ok && primary.codOrderId ? "PASS" : "FAIL",
            "COD order should be created",
            codOrderRes.ok
                ? `Created (${primary.codOrderId})`
                : `HTTP ${codOrderRes.status}: ${messageFrom(codOrderRes)}`,
            { orderId: primary.codOrderId },
        );

        // Duplicate submission
        const duplicateRes = await placeOrder(userToken, addressId, "COD", codKey);
        record(
            "edgeCases",
            "Duplicate order submission",
            duplicateRes.status === 409 ? "PASS" : "FAIL",
            "Same idempotencyKey should be blocked with HTTP 409",
            `HTTP ${duplicateRes.status}: ${messageFrom(duplicateRes)}`,
            { orderId: primary.codOrderId },
        );

        // 2) Online order placement
        const onlineKey = crypto.randomUUID();
        await prepareCart(userToken, bookId, 1);
        const onlineOrderRes = await placeOrder(
            userToken,
            addressId,
            "Online",
            onlineKey,
        );
        const onlineData = unwrapData(onlineOrderRes);
        primary.onlineOrderId = onlineData?.order?._id;
        primary.onlinePaymentId = onlineData?.paymentSessionId || null;

        record(
            "lifecycle",
            "User placed Online (Prepaid) order",
            onlineOrderRes.ok && primary.onlineOrderId ? "PASS" : "FAIL",
            "Online order should be created",
            onlineOrderRes.ok
                ? `Created (${primary.onlineOrderId})`
                : `HTTP ${onlineOrderRes.status}: ${messageFrom(onlineOrderRes)}`,
            {
                orderId: primary.onlineOrderId,
                paymentSessionId: primary.onlinePaymentId,
            },
        );

        // Verify creation in DB
        const [codDbAtCreate, onlineDbAtCreate] = await Promise.all([
            Order.findById(primary.codOrderId).lean(),
            Order.findById(primary.onlineOrderId).lean(),
        ]);
        const createStateOk =
            codDbAtCreate?.orderStatus === "Pending" &&
            codDbAtCreate?.paymentStatus === "Pending" &&
            onlineDbAtCreate?.orderStatus === "Pending" &&
            onlineDbAtCreate?.paymentStatus === "Pending";

        record(
            "lifecycle",
            "Database order creation state",
            createStateOk ? "PASS" : "FAIL",
            "Both orders should start as Pending + payment Pending",
            `COD=${codDbAtCreate?.orderStatus}/${codDbAtCreate?.paymentStatus}, Online=${onlineDbAtCreate?.orderStatus}/${onlineDbAtCreate?.paymentStatus}`,
            {
                codOrderId: primary.codOrderId,
                onlineOrderId: primary.onlineOrderId,
            },
        );

        // 3) Verify order appears in admin dashboard
        const adminListInit = await fetchAdminOrders(adminToken, 200);
        const codInAdmin = adminListInit.items.some((o) => o._id === primary.codOrderId);
        const onlineInAdmin = adminListInit.items.some(
            (o) => o._id === primary.onlineOrderId,
        );

        record(
            "verificationPoints",
            "Order appears in Admin dashboard",
            codInAdmin && onlineInAdmin ? "PASS" : "FAIL",
            "Both newly created orders should be listed in admin orders",
            `COD listed=${codInAdmin}, Online listed=${onlineInAdmin}`,
            { codOrderId: primary.codOrderId, onlineOrderId: primary.onlineOrderId },
        );

        // 4) Admin confirms both orders
        const confirmCod = await updateStatus(adminToken, primary.codOrderId, "Confirmed");
        const confirmOnline = await updateStatus(
            adminToken,
            primary.onlineOrderId,
            "Confirmed",
        );

        record(
            "lifecycle",
            "Admin confirmed both orders",
            confirmCod.ok && confirmOnline.ok ? "PASS" : "FAIL",
            "Admin should move both orders to Confirmed",
            `COD=${confirmCod.status}, Online=${confirmOnline.status}`,
            { codOrderId: primary.codOrderId, onlineOrderId: primary.onlineOrderId },
        );

        await assertMirrorStatus(
            primary.codOrderId,
            "Confirmed",
            userToken,
            adminToken,
            "COD order status",
        );
        await assertMirrorStatus(
            primary.onlineOrderId,
            "Confirmed",
            userToken,
            adminToken,
            "Online order status",
        );

        // 5) Online payment capture simulation
        if (primary.onlinePaymentId) {
            const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "test_secret";
            const mockRazorpayOrderId = `order_${Date.now()}`;
            const signature = crypto
                .createHmac("sha256", webhookSecret)
                .update(`${mockRazorpayOrderId}|${primary.onlinePaymentId}`)
                .digest("hex");

            const webhookRes = await api("/payments/webhook", {
                method: "POST",
                body: {
                    razorpay_order_id: mockRazorpayOrderId,
                    razorpay_payment_id: primary.onlinePaymentId,
                    razorpay_signature: signature,
                },
            });

            const onlinePostWebhook = await Order.findById(primary.onlineOrderId).lean();
            const paymentRow = await Payment.findOne({
                paymentId: primary.onlinePaymentId,
            }).lean();

            const paymentSuccess =
                webhookRes.ok &&
                onlinePostWebhook?.paymentStatus === "Paid" &&
                paymentRow?.status === "Paid";

            record(
                "lifecycle",
                "Online prepaid payment processed",
                paymentSuccess ? "PASS" : "FAIL",
                "Webhook should mark payment as Paid in Payment + Order collections",
                `webhook=${webhookRes.status}, order.paymentStatus=${onlinePostWebhook?.paymentStatus}, payment.status=${paymentRow?.status}`,
                { onlineOrderId: primary.onlineOrderId, paymentId: primary.onlinePaymentId },
            );
        } else {
            record(
                "lifecycle",
                "Online prepaid payment processed",
                "FAIL",
                "Online order should return paymentSessionId for capture",
                "paymentSessionId missing from order creation response",
                { onlineOrderId: primary.onlineOrderId },
            );
        }

        // 6) COD lifecycle status movement
        const codPacked = await updateStatus(adminToken, primary.codOrderId, "Packed");
        record(
            "lifecycle",
            "COD status: Confirmed -> Packed",
            codPacked.ok ? "PASS" : "FAIL",
            "Packed transition should succeed",
            codPacked.ok
                ? "Packed"
                : `HTTP ${codPacked.status}: ${messageFrom(codPacked)}`,
            { orderId: primary.codOrderId },
        );
        await assertMirrorStatus(
            primary.codOrderId,
            "Packed",
            userToken,
            adminToken,
            "COD Packed",
        );

        const codShipment = await api(`/admin/orders/${primary.codOrderId}/shipment`, {
            method: "POST",
            token: adminToken,
        });
        const codAfterShipment = await Order.findById(primary.codOrderId).lean();
        const shipmentOk =
            codShipment.ok &&
            codAfterShipment?.orderStatus === "Shipped" &&
            Boolean(codAfterShipment?.shipping?.awb);

        record(
            "lifecycle",
            "COD status: Packed -> Shipped (with shipment)",
            shipmentOk ? "PASS" : "FAIL",
            "Shipment API should move to Shipped and persist AWB/tracking fields",
            `HTTP ${codShipment.status}, orderStatus=${codAfterShipment?.orderStatus}, awb=${codAfterShipment?.shipping?.awb || "N/A"}`,
            { orderId: primary.codOrderId, shipping: codAfterShipment?.shipping },
        );
        await assertMirrorStatus(
            primary.codOrderId,
            "Shipped",
            userToken,
            adminToken,
            "COD Shipped",
        );

        const codOutForDelivery = await updateStatus(
            adminToken,
            primary.codOrderId,
            "Out for Delivery",
        );
        record(
            "lifecycle",
            "COD status: Shipped -> Out for Delivery",
            codOutForDelivery.ok ? "PASS" : "FAIL",
            "Out for Delivery transition should succeed",
            codOutForDelivery.ok
                ? "Out for Delivery"
                : `HTTP ${codOutForDelivery.status}: ${messageFrom(codOutForDelivery)}`,
            { orderId: primary.codOrderId },
        );
        await assertMirrorStatus(
            primary.codOrderId,
            "Out for Delivery",
            userToken,
            adminToken,
            "COD Out for Delivery",
        );

        const codDelivered = await updateStatus(adminToken, primary.codOrderId, "Delivered");
        record(
            "lifecycle",
            "COD status: Out for Delivery -> Delivered",
            codDelivered.ok ? "PASS" : "FAIL",
            "Delivered transition should succeed",
            codDelivered.ok
                ? "Delivered"
                : `HTTP ${codDelivered.status}: ${messageFrom(codDelivered)}`,
            { orderId: primary.codOrderId },
        );
        await assertMirrorStatus(
            primary.codOrderId,
            "Delivered",
            userToken,
            adminToken,
            "COD Delivered",
        );

        // 7) COD payment after delivery
        const codAfterDelivery = await Order.findById(primary.codOrderId).lean();
        const codPaidAfterDelivery = codAfterDelivery?.paymentStatus === "Paid";
        record(
            "edgeCases",
            "COD payment becomes Paid after delivery",
            codPaidAfterDelivery ? "PASS" : "FAIL",
            'COD order paymentStatus should become "Paid" once delivered',
            `paymentStatus=${codAfterDelivery?.paymentStatus}`,
            { orderId: primary.codOrderId },
        );

        // 8) statusHistory verification
        const requiredCodStatuses = [
            "Pending",
            "Confirmed",
            "Packed",
            "Shipped",
            "Out for Delivery",
            "Delivered",
        ];

        const history = codAfterDelivery?.statusHistory || [];
        const hasAllStatuses = requiredCodStatuses.every((status) =>
            history.some((h) => h.status === status),
        );
        const historyChronological = ensureHistoryChronology(history);

        record(
            "lifecycle",
            "statusHistory timestamps in DB",
            hasAllStatuses && historyChronological ? "PASS" : "FAIL",
            "statusHistory should include each lifecycle status with valid chronological timestamps",
            `hasAllStatuses=${hasAllStatuses}, chronological=${historyChronological}, count=${history.length}`,
            { orderId: primary.codOrderId },
        );

        // 9) Replacement request + approval on COD
        const replacementReq = await api(`/orders/${primary.codOrderId}/replacement`, {
            method: "POST",
            token: userToken,
            body: { reason: `Damaged pages (${report.metadata.runTag})` },
        });
        const replacementReqOk = replacementReq.ok;

        record(
            "lifecycle",
            "User requested replacement after delivery",
            replacementReqOk ? "PASS" : "FAIL",
            "Delivered user order should allow replacement request (within 7 days)",
            replacementReqOk
                ? "Replacement requested"
                : `HTTP ${replacementReq.status}: ${messageFrom(replacementReq)}`,
            { orderId: primary.codOrderId },
        );
        await assertMirrorStatus(
            primary.codOrderId,
            "Replacement Requested",
            userToken,
            adminToken,
            "COD Replacement Requested",
        );

        const replacementApprove = await api(
            `/admin/orders/${primary.codOrderId}/replacement/approve`,
            {
                method: "POST",
                token: adminToken,
            },
        );
        const replacementApproveOk = replacementApprove.ok;

        record(
            "lifecycle",
            "Admin approved replacement",
            replacementApproveOk ? "PASS" : "FAIL",
            "Admin should approve replacement request",
            replacementApproveOk
                ? "Replacement approved"
                : `HTTP ${replacementApprove.status}: ${messageFrom(replacementApprove)}`,
            { orderId: primary.codOrderId },
        );
        await assertMirrorStatus(
            primary.codOrderId,
            "Replacement Approved",
            userToken,
            adminToken,
            "COD Replacement Approved",
        );

        const codReplacementDb = await Order.findById(primary.codOrderId).lean();
        const replacementVisibleForUser =
            codReplacementDb?.replacement?.replacementStatus === "Approved";
        record(
            "verificationPoints",
            "Replacement status visible on user order payload",
            replacementVisibleForUser ? "PASS" : "FAIL",
            "Order should contain replacement object with updated replacementStatus",
            `replacementStatus=${codReplacementDb?.replacement?.replacementStatus}`,
            { orderId: primary.codOrderId },
        );

        // 10) Replacement reject case + shipment validation on Online order
        const onlinePacked = await updateStatus(
            adminToken,
            primary.onlineOrderId,
            "Packed",
        );
        record(
            "lifecycle",
            "Online order status -> Packed",
            onlinePacked.ok ? "PASS" : "FAIL",
            "Packed transition should succeed",
            onlinePacked.ok
                ? "Packed applied"
                : `HTTP ${onlinePacked.status}: ${messageFrom(onlinePacked)}`,
            { orderId: primary.onlineOrderId },
        );

        const invalidShipTransition = await updateStatus(
            adminToken,
            primary.onlineOrderId,
            "Shipped",
        );
        record(
            "edgeCases",
            "Courier tracking or shipment data missing",
            !invalidShipTransition.ok ? "PASS" : "FAIL",
            "Packed -> Shipped should be blocked without shipment details",
            `HTTP ${invalidShipTransition.status}: ${messageFrom(invalidShipTransition)}`,
            { orderId: primary.onlineOrderId },
        );

        const onlineShipment = await api(
            `/admin/orders/${primary.onlineOrderId}/shipment`,
            {
                method: "POST",
                token: adminToken,
            },
        );
        record(
            "lifecycle",
            "Online order status -> Shipped (shipment API)",
            onlineShipment.ok ? "PASS" : "FAIL",
            "Shipment API should create AWB and move order to Shipped",
            onlineShipment.ok
                ? "Shipment created"
                : `HTTP ${onlineShipment.status}: ${messageFrom(onlineShipment)}`,
            { orderId: primary.onlineOrderId },
        );

        const onlineOutForDelivery = await updateStatus(
            adminToken,
            primary.onlineOrderId,
            "Out for Delivery",
        );
        record(
            "lifecycle",
            "Online order status -> Out for Delivery",
            onlineOutForDelivery.ok ? "PASS" : "FAIL",
            "Out for Delivery transition should succeed",
            onlineOutForDelivery.ok
                ? "Out for Delivery applied"
                : `HTTP ${onlineOutForDelivery.status}: ${messageFrom(onlineOutForDelivery)}`,
            { orderId: primary.onlineOrderId },
        );

        const onlineDelivered = await updateStatus(
            adminToken,
            primary.onlineOrderId,
            "Delivered",
        );
        record(
            "lifecycle",
            "Online order status -> Delivered",
            onlineDelivered.ok ? "PASS" : "FAIL",
            "Delivered transition should succeed",
            onlineDelivered.ok
                ? "Delivered applied"
                : `HTTP ${onlineDelivered.status}: ${messageFrom(onlineDelivered)}`,
            { orderId: primary.onlineOrderId },
        );

        const onlineReplacementReq = await api(
            `/orders/${primary.onlineOrderId}/replacement`,
            {
                method: "POST",
                token: userToken,
                body: { reason: `Need replacement (${report.metadata.runTag})` },
            },
        );
        const onlineReplacementRequested = onlineReplacementReq.ok;
        record(
            "lifecycle",
            "Online order replacement request",
            onlineReplacementRequested ? "PASS" : "FAIL",
            "User should be able to request replacement after delivery",
            onlineReplacementRequested
                ? "Replacement requested"
                : `HTTP ${onlineReplacementReq.status}: ${messageFrom(onlineReplacementReq)}`,
            { orderId: primary.onlineOrderId },
        );

        const rejectEndpointRes = await api(
            `/admin/orders/${primary.onlineOrderId}/replacement/reject`,
            {
                method: "POST",
                token: adminToken,
                body: {
                    reason: `Quality check failed (${report.metadata.runTag})`,
                },
            },
        );
        const rejectedOrderDb = await Order.findById(primary.onlineOrderId).lean();

        const rejectSupported =
            rejectEndpointRes.ok &&
            rejectedOrderDb?.orderStatus === "Replacement Rejected" &&
            rejectedOrderDb?.replacement?.replacementStatus === "Rejected";
        record(
            "lifecycle",
            "Admin rejected replacement",
            rejectSupported ? "PASS" : "FAIL",
            "Admin should reject replacement with reason and persist status",
            `HTTP ${rejectEndpointRes.status}, orderStatus=${rejectedOrderDb?.orderStatus}, replacementStatus=${rejectedOrderDb?.replacement?.replacementStatus}`,
            {
                orderId: primary.onlineOrderId,
                rejectEndpointMessage: messageFrom(rejectEndpointRes),
                replacementRejectionReason:
                    rejectedOrderDb?.replacement?.replacementRejectionReason,
            },
        );

        record(
            "edgeCases",
            "Replacement reject path availability",
            rejectSupported ? "PASS" : "FAIL",
            "Replacement rejection should be implemented and reachable",
            rejectSupported
                ? "Available"
                : "No working route/validation path for rejection",
            { orderId: primary.onlineOrderId },
        );

        // 11) User cancel before shipping
        await prepareCart(userToken, bookId, 1);
        const cancelOrderCreate = await placeOrder(
            userToken,
            addressId,
            "COD",
            crypto.randomUUID(),
        );
        const cancelOrderId = unwrapData(cancelOrderCreate)?.order?._id;
        const cancelRes = await api(`/orders/${cancelOrderId}/cancel`, {
            method: "PATCH",
            token: userToken,
            body: { reason: `Cancel before shipping (${report.metadata.runTag})` },
        });

        const cancelDb = await Order.findById(cancelOrderId).lean();
        const cancelOk = cancelRes.ok && cancelDb?.orderStatus === "Cancelled";
        record(
            "edgeCases",
            "User cancelling before shipping",
            cancelOk ? "PASS" : "FAIL",
            "Pending order should be cancellable by user",
            `HTTP ${cancelRes.status}, orderStatus=${cancelDb?.orderStatus}`,
            { orderId: cancelOrderId },
        );

        // 12) Invalid status transition blocked
        await prepareCart(userToken, bookId, 1);
        const invalidCreate = await placeOrder(
            userToken,
            addressId,
            "COD",
            crypto.randomUUID(),
        );
        const invalidOrderId = unwrapData(invalidCreate)?.order?._id;

        const invalidTransition = await updateStatus(
            adminToken,
            invalidOrderId,
            "Delivered",
        );
        record(
            "edgeCases",
            "Status transition validation (invalid changes blocked)",
            !invalidTransition.ok ? "PASS" : "FAIL",
            "Pending -> Delivered should be rejected",
            `HTTP ${invalidTransition.status}: ${messageFrom(invalidTransition)}`,
            { orderId: invalidOrderId },
        );

        // 13) Admin updating status multiple times
        const firstConfirm = await updateStatus(adminToken, invalidOrderId, "Confirmed");
        const secondConfirm = await updateStatus(adminToken, invalidOrderId, "Confirmed");
        record(
            "edgeCases",
            "Admin updating status multiple times",
            firstConfirm.ok && !secondConfirm.ok ? "PASS" : "FAIL",
            "Repeated identical status update should be blocked",
            `first=HTTP ${firstConfirm.status}, second=HTTP ${secondConfirm.status}`,
            { orderId: invalidOrderId },
        );

        // 14) Online payment failure
        await prepareCart(userToken, bookId, 1);
        const onlineFailCreate = await placeOrder(
            userToken,
            addressId,
            "Online",
            crypto.randomUUID(),
        );
        const onlineFailData = unwrapData(onlineFailCreate);
        const failOrderId = onlineFailData?.order?._id;
        const failPaymentId = onlineFailData?.paymentSessionId;

        const failRes = await api("/payments/failure", {
            method: "POST",
            token: userToken,
            body: {
                paymentId: failPaymentId,
                reason: `Simulated payment failure (${report.metadata.runTag})`,
            },
        });
        const failOrderDb = await Order.findById(failOrderId).lean();
        const failPaymentDb = await Payment.findOne({ paymentId: failPaymentId }).lean();

        const onlineFailureHandled =
            failRes.ok &&
            failOrderDb?.paymentStatus === "Failed" &&
            failPaymentDb?.status === "Failed";
        record(
            "edgeCases",
            "Online payment failure",
            onlineFailureHandled ? "PASS" : "FAIL",
            "Failure handler should mark Payment + Order as Failed",
            `HTTP ${failRes.status}, order.paymentStatus=${failOrderDb?.paymentStatus}, payment.status=${failPaymentDb?.status}`,
            { orderId: failOrderId, paymentId: failPaymentId },
        );

        // 15) User replacement request after allowed window
        await prepareCart(userToken, bookId, 1);
        const lateCreate = await placeOrder(
            userToken,
            addressId,
            "COD",
            crypto.randomUUID(),
        );
        const lateOrderId = unwrapData(lateCreate)?.order?._id;
        await updateStatus(adminToken, lateOrderId, "Confirmed");
        await updateStatus(adminToken, lateOrderId, "Packed");
        await api(`/admin/orders/${lateOrderId}/shipment`, {
            method: "POST",
            token: adminToken,
        });
        await updateStatus(adminToken, lateOrderId, "Out for Delivery");
        await updateStatus(adminToken, lateOrderId, "Delivered");

        const oldDeliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        await Order.updateOne(
            { _id: lateOrderId },
            { $set: { "shipping.deliveredAt": oldDeliveredAt } },
        );

        const lateReplacementReq = await api(`/orders/${lateOrderId}/replacement`, {
            method: "POST",
            token: userToken,
            body: { reason: "Late replacement test" },
        });

        record(
            "edgeCases",
            "User requesting replacement after allowed window",
            !lateReplacementReq.ok ? "PASS" : "FAIL",
            "Replacement request after 7 days should be blocked",
            `HTTP ${lateReplacementReq.status}: ${messageFrom(lateReplacementReq)}`,
            { orderId: lateOrderId, forcedDeliveredAt: oldDeliveredAt.toISOString() },
        );

        // 16) Verification points from API/DB data
        const finalCod = await Order.findById(primary.codOrderId).lean();
        const timelineDataPresent =
            Array.isArray(finalCod?.statusHistory) && finalCod.statusHistory.length > 0;
        record(
            "verificationPoints",
            "Tracking timeline data available to user",
            timelineDataPresent ? "PASS" : "FAIL",
            "Order payload should expose statusHistory for timeline UI",
            `statusHistoryCount=${finalCod?.statusHistory?.length || 0}`,
            { orderId: primary.codOrderId },
        );

        const orderDocConsistency =
            finalCod?.orderStatus === "Replacement Approved" &&
            finalCod?.replacement?.replacementStatus === "Approved";
        record(
            "verificationPoints",
            "Database order document updated correctly",
            orderDocConsistency ? "PASS" : "FAIL",
            "Order document should match lifecycle transitions and replacement state",
            `orderStatus=${finalCod?.orderStatus}, replacementStatus=${finalCod?.replacement?.replacementStatus}`,
            { orderId: primary.codOrderId },
        );

        const shipmentFieldsStored =
            Boolean(finalCod?.shipping?.awb) && Boolean(finalCod?.shipping?.trackingUrl);
        record(
            "verificationPoints",
            "Shipment or courier fields stored correctly",
            shipmentFieldsStored ? "PASS" : "FAIL",
            "Shipment-created order should persist AWB + trackingUrl",
            `awb=${finalCod?.shipping?.awb || "N/A"}, trackingUrl=${finalCod?.shipping?.trackingUrl || "N/A"}`,
            { orderId: primary.codOrderId },
        );

        // Email + instant frontend updates cannot be fully validated from API alone.
        record(
            "verificationPoints",
            "Status updates reflect instantly on frontend",
            "BLOCKED",
            "Real-time UI update should be validated via browser session/subscribed socket events",
            "This CLI run validates API + DB only; frontend live refresh not directly asserted here.",
            {},
        );

        record(
            "edgeCases",
            "Email sending failures",
            "BLOCKED",
            "Email provider failure path should be tested with a controlled mail transport failure",
            "Not deterministic from API-only run; requires mail provider fault injection/log capture.",
            {},
        );

        record(
            "lifecycle",
            "Order confirmation email sent to user",
            "BLOCKED",
            "User mailbox delivery should be validated externally (provider logs/inbox)",
            "Not directly verifiable via API response; backend logs were captured separately.",
            {},
        );
    } catch (error) {
        report.executionNotes.push(`Fatal execution error: ${error.message}`);
        console.error("Fatal error:", error);
    } finally {
        report.metadata.finishedAt = new Date().toISOString();
        report.metadata.primaryOrders = primary;

        const allItems = [
            ...report.lifecycle,
            ...report.edgeCases,
            ...report.verificationPoints,
        ];

        const counts = allItems.reduce(
            (acc, item) => {
                acc[item.status] = (acc[item.status] || 0) + 1;
                return acc;
            },
            { PASS: 0, FAIL: 0, WARN: 0, BLOCKED: 0 },
        );

        report.summary = {
            totalChecks: allItems.length,
            pass: counts.PASS || 0,
            fail: counts.FAIL || 0,
            warn: counts.WARN || 0,
            blocked: counts.BLOCKED || 0,
        };

        const outputPath = path.resolve(
            process.cwd(),
            `e2e_order_lifecycle_report_${Date.now()}.json`,
        );
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

        console.log("==================================================");
        console.log("E2E ORDER LIFECYCLE TEST COMPLETED");
        console.log(`Report file: ${outputPath}`);
        console.log(`Summary: ${JSON.stringify(report.summary)}`);
        console.log("==================================================");

        await mongoose.disconnect();
    }
}

run();
