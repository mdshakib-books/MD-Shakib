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
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data;
}

async function runTest() {
    try {
        console.log("=== STARTING E-COMMERCE E2E TEST ===\n");

        // 1. User Login
        console.log("1. Authenticating User...");
        const userLogin = await request('/users/login', 'POST', {
            email: 'mauryaanushka089@gmail.com',
            password: 'Arry00@#'
        });
        const userToken = userLogin.data.accessToken;
        console.log("User authenticated successfully.\n");

        // 2. Admin Login
        console.log("2. Authenticating Admin...");
        const adminLogin = await request('/users/login', 'POST', {
            email: 'arifquerry@gmail.com',
            password: 'Arry00@'
        });
        const adminToken = adminLogin.data.accessToken;
        console.log("Admin authenticated successfully.\n");

        // 3. User Cart Setup
        console.log("3. Add book to cart...");
        const booksData = await request('/books');
        const books = Array.isArray(booksData.data) ? booksData.data : booksData.data.items;
        if (!books || books.length === 0) throw new Error("No books in DB!");
        const bookId = books[0]._id;
        
        await request('/cart/add', 'POST', { bookId, quantity: 1 }, userToken);
        console.log(`Book ${bookId} added to cart.\n`);

        // 4. User Addresses
        console.log("4. Fetching User Addresses...");
        let addressesData;
        try {
           addressesData = await request('/addresses', 'GET', null, userToken);
        } catch(err) {
           console.log("No addresses/endpoint, or err:", err.message);
        }
        
        let addressId = null;
        if (addressesData && addressesData.data && addressesData.data.length > 0) {
            addressId = addressesData.data[0]._id;
        } else {
            console.log("Adding a testing address...");
            const newAddr = await request('/addresses', 'POST', {
                fullName: "Test User",
                phone: "9876543210",
                pincode: "110001",
                state: "Delhi",
                city: "New Delhi",
                houseNo: "Block A",
                area: "Connaught Place",
                type: "Home"
            }, userToken);
            addressId = newAddr.data._id;
        }
        console.log(`Address selected: ${addressId}\n`);

        // 5. Create Order
        console.log("5. Creating Order (COD)...");
        const orderData = await request('/orders', 'POST', {
            addressId,
            paymentMethod: "COD",
            idempotencyKey: crypto.randomUUID()
        }, userToken);
        const orderId = orderData.data.order._id;
        console.log(`Order ${orderId} created. Status: ${orderData.data.order.orderStatus}\n`);

        // 6. Admin Confirms Order
        console.log("6. Admin confirming order...");
        const confirmData = await request(`/admin/orders/${orderId}/status`, 'PATCH', { status: 'Confirmed' }, adminToken);
        console.log(`Order updated. New Status: ${confirmData.data.orderStatus}\n`);

        // 7. Admin Packs Order
        console.log("7. Admin packing order...");
        const packData = await request(`/admin/orders/${orderId}/status`, 'PATCH', { status: 'Packed' }, adminToken);
        console.log(`Order updated. New Status: ${packData.data.orderStatus}\n`);

        // 8. Admin Ships Order (Delhivery)
        console.log("8. Admin creating Delhivery Shipment...");
        const shipData = await request(`/admin/orders/${orderId}/shipment`, 'POST', null, adminToken);
        console.log(`Shipment Response: AWB ${shipData.data.shipping.awb}. New Status: ${shipData.data.orderStatus}\n`);

        // 9. Admin Changes Status to Delivered (To allow Replacement)
        console.log("9. Admin delivering order (manual override)...");
        await request(`/admin/orders/${orderId}/status`, 'PATCH', { status: 'Out for Delivery' }, adminToken);
        const deliveredData = await request(`/admin/orders/${orderId}/status`, 'PATCH', { status: 'Delivered' }, adminToken);
        console.log(`Order marked as Delivered.\n`);

        // 10. User Requests Replacement
        console.log("10. User requesting replacement...");
        const repData = await request(`/orders/${orderId}/replacement`, 'POST', { reason: "Damaged pages in the book." }, userToken);
        console.log(`Replacement requested. Status: ${repData.data.orderStatus}, Reason: ${repData.data.replacement.replacementReason}\n`);

        // 11. Admin Approves Replacement
        console.log("11. Admin approving replacement...");
        const repApproveData = await request(`/admin/orders/${orderId}/replacement/approve`, 'POST', null, adminToken);
        console.log(`Replacement approved. Status: ${repApproveData.data.orderStatus}\n`);

        console.log("=== ALL TESTS PASSED SUCCESSFULLY ===");

    } catch (err) {
        console.error("TEST FAILED:", err.message);
    }
}

runTest();
