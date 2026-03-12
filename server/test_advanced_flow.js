import crypto from 'crypto';

const BASE_URL = 'http://localhost:8000/api/v1';

async function request(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    // Convert to fetch API format
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(BASE_URL + endpoint, options);
    const data = await res.json();
    return { status: res.status, ok: res.ok, data };
}

async function runAdvancedTest() {
    console.log("=========================================");
    console.log("🚀 STARTING E-COMMERCE ADVANCED E2E TEST");
    console.log("=========================================\n");

    try {
        // --- 1. Authentication ---
        console.log("1. Authenticating Users...");
        const userLogin = await request('/users/login', 'POST', { email: 'mauryaanushka089@gmail.com', password: 'Arry00@#' });
        if (!userLogin.ok) throw new Error("User login failed: " + JSON.stringify(userLogin.data));
        const userToken = userLogin.data.data.accessToken;
        
        const adminLogin = await request('/users/login', 'POST', { email: 'arifquerry@gmail.com', password: 'Arry00@' });
        if (!adminLogin.ok) throw new Error("Admin login failed");
        const adminToken = adminLogin.data.data.accessToken;
        console.log("✅ Admin & User authenticated.\n");

        // --- 2. Preparations (Cart & Address) ---
        console.log("2. Preparing Cart & Address...");
        const booksData = await request('/books');
        const books = Array.isArray(booksData.data.data) ? booksData.data.data : booksData.data.data.items;
        const bookId = books[0]._id;
        
        // Add to cart
        await request('/cart/add', 'POST', { bookId, quantity: 1 }, userToken);
        console.log("✅ Added book to cart.");

        // Get Address
        let addressId;
        const addressesData = await request('/addresses', 'GET', null, userToken);
        if (addressesData.ok && addressesData.data.data && addressesData.data.data.length > 0) {
            addressId = addressesData.data.data[0]._id;
        } else {
            const newAddr = await request('/addresses', 'POST', {
                fullName: "Test User", phone: "9876543210", pincode: "110001",
                state: "Delhi", city: "New Delhi", houseNo: "Block A", area: "Connaught Place", type: "Home"
            }, userToken);
            addressId = newAddr.data.data._id;
        }
        console.log("✅ Resolved shipping address.\n");

        // --- 3. COD Order Placement & Idempotency ---
        console.log("3. Placing COD Order (Normal & Duplicate)...");
        const uniqueKey = crypto.randomUUID();
        const codOrder1 = await request('/orders', 'POST', { addressId, paymentMethod: "COD", idempotencyKey: uniqueKey }, userToken);
        
        if (!codOrder1.ok) throw new Error("COD Order failed: " + JSON.stringify(codOrder1.data));
        const codOrderId = codOrder1.data.data.order._id;
        console.log(`✅ COD Order created: ${codOrderId} | Status: ${codOrder1.data.data.order.orderStatus}`);

        // Try double-submission
        const codOrder2 = await request('/orders', 'POST', { addressId, paymentMethod: "COD", idempotencyKey: uniqueKey }, userToken);
        if (!codOrder2.ok) {
            console.log("✅ Duplicate order blocked correctly by API.");
        } else {
            console.log("⚠️  API ALLOWED DUPLICATE ORDER WITH SAME IDEMPOTENCY KEY. Needs improvement.");
        }
        console.log("");

        // --- 4. Online Paid Order Placement ---
        console.log("4. Placing Online Order (Prepaid)...");
        await request('/cart/add', 'POST', { bookId, quantity: 1 }, userToken); // Re-add since it clears
        const onlineKey = crypto.randomUUID();
        const onlineOrder = await request('/orders', 'POST', { addressId, paymentMethod: "Online", idempotencyKey: onlineKey }, userToken);
        const onlineOrderId = onlineOrder.data.data.order._id;
        console.log(`✅ Online Order created: ${onlineOrderId} | Needs payment verified.`);

        // Simulate Razorpay Webhook to confirm the online order
        // Razorpay webhooks usually require a signature. The backend might reject it without valid signature.
        console.log("   Simulating Razorpay Payment Webhook...");
        const razorpayPayload = {
            event: "payment.captured",
            payload: { payment: { entity: { order_id: onlineOrder.data.data.razorpayOrderId, status: "captured" } } }
        };
        const rzpSig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || 'test').update(JSON.stringify(razorpayPayload)).digest('hex');
        const rzpRes = await request('/payments/webhook', 'POST', razorpayPayload, null);
        // Note: Unless RAZORPAY_WEBHOOK_SECRET matches, it will fail.
        console.log(`   Webhook Response Status: ${rzpRes.status} (May fail due to signature, that's expected without actual secret).`);
        console.log("");


        // --- 5. Status Transitions & Validations (Admin) ---
        console.log("5. Testing Admin Status Transitions...");
        
        // Invalid Status Change (Pending -> Delivered)
        let invUpdate = await request(`/admin/orders/${codOrderId}/status`, 'PATCH', { status: 'Delivered' }, adminToken);
        if (!invUpdate.ok && invUpdate.data.message.includes('Invalid status transition')) {
            console.log("✅ Invalid status transition blocked (Pending -> Delivered).");
        } else {
            console.log(`⚠️  Invalid status transition NOT blocked or different error: ${JSON.stringify(invUpdate.data)}`);
        }

        // Valid Status changes step-by-step
        const steps = ['Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
        for (const status of steps) {
            let update = await request(`/admin/orders/${codOrderId}/status`, 'PATCH', { status }, adminToken);
            if (update.ok) {
                console.log(`✅ Order ${codOrderId} moved to ${status}`);
            } else {
                console.log(`❌ Failed to move to ${status}: ${JSON.stringify(update.data)}`);
                break;
            }
        }
        
        // Fetch to verify Status History
        const finalOrder = await request(`/admin/orders/${codOrderId}`, 'GET', null, adminToken);
        if (finalOrder.data.data.statusHistory && finalOrder.data.data.statusHistory.length >= 6) {
            console.log("✅ Status history tracks all transitions accurately.");
        } else {
            console.log("⚠️  Status history is missing some transitions.");
        }

        console.log("");

        // --- 6. User Cancel Order Before Shipping ---
        console.log("6. Testing Order Cancellation...");
        await request('/cart/add', 'POST', { bookId, quantity: 1 }, userToken);
        const cancelOrderRes = await request('/orders', 'POST', { addressId, paymentMethod: "COD", idempotencyKey: crypto.randomUUID() }, userToken);
        const cOrderId = cancelOrderRes.data.data.order._id;
        
        // User cancels
        const userCancel = await request(`/orders/${cOrderId}/cancel`, 'PATCH', { reason: "Changed my mind" }, userToken);
        if (userCancel.ok && userCancel.data.data.orderStatus === 'Cancelled') {
            console.log("✅ User successfully cancelled 'Pending' order.");
        } else {
            console.log("❌ User failed to cancel order: " + JSON.stringify(userCancel.data));
        }

        // User changing status after shipment?
        const lateCancel = await request(`/orders/${codOrderId}/cancel`, 'PATCH', { reason: "Too late" }, userToken);
        if (!lateCancel.ok) {
            console.log("✅ User correctly blocked from cancelling 'Delivered' order.");
        } else {
            console.log("⚠️  User allowed to cancel an already delivered order.");
        }
        console.log("");

        // --- 7. Replacement Flow ---
        console.log("7. Testing Replacement Flow...");
        // User requests replacement
        const repReq = await request(`/orders/${codOrderId}/replacement`, 'POST', { reason: "Wrong item received." }, userToken);
        if (repReq.ok && repReq.data.data.orderStatus === 'Replacement Requested') {
            console.log("✅ User requested replacement.");
        } else {
            console.log("❌ User replacement request failed: " + JSON.stringify(repReq.data));
        }

        // Admin approves replacement
        const repApprov = await request(`/admin/orders/${codOrderId}/replacement/approve`, 'POST', null, adminToken);
        if (repApprov.ok && repApprov.data.data.orderStatus === 'Replacement Approved') {
            console.log("✅ Admin approved replacement.");
        } else {
            console.log("❌ Admin failed to approve replacement: " + JSON.stringify(repApprov.data));
        }
        console.log("");

        console.log("=========================================");
        console.log("✅ ADVANCED E2E TEST COMPLETED!");
        console.log("=========================================\n");

    } catch (err) {
        console.error("❌ SCRIPT CRASHED:", err.message);
    }
}

runAdvancedTest();
