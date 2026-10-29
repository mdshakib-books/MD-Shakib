import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const anonClient = createClient(supabaseUrl, supabaseAnonKey);

async function runCommerceTests() {
  console.log("=== PHASE 5C: PERSISTENT CART, ADDRESSES & ATOMIC ORDER SUITE ===");

  const timestamp = Date.now();
  const emailA = `buyerA_${timestamp}@example.com`;
  const emailB = `buyerB_${timestamp}@example.com`;
  const password = "SecurePassword123!";

  // 1. Setup Customer A & Customer B
  console.log("\n1. Registering Customer A & Customer B");
  const { data: userAData } = await anonClient.auth.signUp({
    email: emailA,
    password,
    options: { data: { name: "Customer Alpha" } },
  });
  const userA = userAData.user;

  const { data: userBData } = await anonClient.auth.signUp({
    email: emailB,
    password,
    options: { data: { name: "Customer Beta" } },
  });
  const userB = userBData.user;

  // Log in Customer A
  const { data: loginA } = await anonClient.auth.signInWithPassword({ email: emailA, password });
  const clientA = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${loginA.session.access_token}` } },
  });

  // Log in Customer B
  const { data: loginB } = await anonClient.auth.signInWithPassword({ email: emailB, password });
  const clientB = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${loginB.session.access_token}` } },
  });

  console.log("[PASS] Customers created and authenticated.");

  // 2. Address CRUD & Single Default Address Trigger
  console.log("\n2. Testing Address CRUD & handle_default_address() trigger");
  const { data: addr1, error: addr1Err } = await clientA
    .from("addresses")
    .insert({
      user_id: userA.id,
      full_name: "Customer Alpha",
      phone: "9876543210",
      house_no: "Flat 101",
      area: "Al-Noor Colony",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700016",
      is_default: true,
    })
    .select("id, is_default")
    .single();

  if (addr1Err) throw addr1Err;
  console.log(`[PASS] Inserted Address 1 (Default: ${addr1.is_default})`);

  // Insert Address 2 with is_default: true -> should unset Address 1 default
  const { data: addr2, error: addr2Err } = await clientA
    .from("addresses")
    .insert({
      user_id: userA.id,
      full_name: "Customer Alpha (Office)",
      phone: "9876543210",
      house_no: "Suite 4B",
      area: "Park Street",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700016",
      is_default: true,
    })
    .select("id, is_default")
    .single();

  if (addr2Err) throw addr2Err;

  // Verify Address 1 is_default is now FALSE
  const { data: addr1Check } = await clientA.from("addresses").select("is_default").eq("id", addr1.id).single();
  if (addr1Check.is_default !== false) {
    throw new Error("Trigger failure: Previous default address was not unset!");
  }
  console.log("[PASS] Single default address invariant verified by database trigger");

  // 3. Address Cross-Tenant Isolation
  console.log("\n3. Testing Address Cross-Tenant Isolation");
  const { data: crossAddrs } = await clientB.from("addresses").select("*").eq("id", addr1.id);
  if (crossAddrs && crossAddrs.length > 0) {
    throw new Error("SECURITY FAILURE: Customer B can view Customer A address!");
  }
  console.log("[PASS] Customer B cannot read Customer A addresses (RLS enforced)");

  // 4. Cart Operations & Persistence
  console.log("\n4. Testing Persistent Cart Operations (Add, Update, Remove)");
  // Create cart for user A
  const { data: cartA } = await clientA.from("carts").insert({ user_id: userA.id }).select("id").single();
  const cartIdA = cartA.id;

  // Select a book
  const { data: testBook } = await clientA.from("books").select("id, price, stock").eq("is_active", true).limit(1).single();

  // Add item
  const { data: cartItem1, error: cItemErr } = await clientA
    .from("cart_items")
    .insert({ cart_id: cartIdA, book_id: testBook.id, quantity: 2, price: testBook.price })
    .select("*")
    .single();

  if (cItemErr) throw cItemErr;
  console.log(`[PASS] Added book to cart (Qty: ${cartItem1.quantity})`);

  // Update quantity to 3
  const { error: updCartErr } = await clientA
    .from("cart_items")
    .update({ quantity: 3 })
    .eq("id", cartItem1.id);

  if (updCartErr) throw updCartErr;
  const { data: cartItemCheck } = await clientA.from("cart_items").select("quantity").eq("id", cartItem1.id).single();
  if (cartItemCheck.quantity !== 3) throw new Error("Quantity update failed");
  console.log("[PASS] Cart item quantity successfully updated to 3");

  // 5. Cart Cross-Tenant Isolation
  console.log("\n5. Testing Cart Cross-Tenant Isolation");
  const { data: crossCart } = await clientB.from("cart_items").select("*").eq("id", cartItem1.id);
  if (crossCart && crossCart.length > 0) {
    throw new Error("SECURITY FAILURE: Customer B can view Customer A cart items!");
  }
  console.log("[PASS] Customer B cannot view Customer A cart items (RLS enforced)");

  // 6. Atomic Order Creation & Concurrency/Stock Check
  console.log("\n6. Testing Atomic Order Creation (create_order_atomic)");
  const initialStock = testBook.stock;
  const orderQty = 2;
  const itemPrice = Number(testBook.price);
  const totalAmount = itemPrice * orderQty + 10 + 35; // Subtotal + Platform + Delivery

  const addressSnapshot = {
    full_name: "Customer Alpha",
    phone: "9876543210",
    house_no: "Suite 4B",
    area: "Park Street",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700016",
  };

  const { data: orderId, error: orderRpcErr } = await clientA.rpc("create_order_atomic", {
    p_user_id: userA.id,
    p_items: [{ book_id: testBook.id, quantity: orderQty, price: itemPrice }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "COD",
    p_total_amount: totalAmount,
  });

  if (orderRpcErr) throw orderRpcErr;
  console.log(`[PASS] Order successfully created atomically: ID ${orderId}`);

  // Verify stock decremented
  const { data: bookAfter } = await clientA.from("books").select("stock").eq("id", testBook.id).single();
  if (bookAfter.stock !== initialStock - orderQty) {
    throw new Error(`Stock mismatch: Expected ${initialStock - orderQty}, got ${bookAfter.stock}`);
  }
  console.log(`[PASS] Inventory decremented atomically from ${initialStock} to ${bookAfter.stock}`);

  // Verify cart cleared
  const { data: remainingCartItems } = await clientA.from("cart_items").select("*").eq("cart_id", cartIdA);
  if (remainingCartItems && remainingCartItems.length > 0) {
    throw new Error("Cart was not cleared after order creation!");
  }
  console.log("[PASS] Customer cart automatically cleared after order placement");

  // 7. Insufficient Stock Rollback Test
  console.log("\n7. Testing Insufficient Stock Rollback");
  const excessiveQty = initialStock + 100;
  const { error: excessiveErr } = await clientA.rpc("create_order_atomic", {
    p_user_id: userA.id,
    p_items: [{ book_id: testBook.id, quantity: excessiveQty, price: itemPrice }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "COD",
    p_total_amount: itemPrice * excessiveQty + 45,
  });

  if (!excessiveErr) throw new Error("Transaction allowed ordering more than available stock!");
  console.log(`[PASS] Insufficient stock rejected with error: "${excessiveErr.message}"`);

  // Verify stock unchanged after rejected transaction
  const { data: bookRollbackCheck } = await clientA.from("books").select("stock").eq("id", testBook.id).single();
  if (bookRollbackCheck.stock !== bookAfter.stock) {
    throw new Error("Stock changed during failed order transaction!");
  }
  console.log("[PASS] Transaction rolled back safely with zero stock alteration");

  // 8. Order Cross-Tenant Read Isolation
  console.log("\n8. Testing Order Cross-Tenant Read Isolation");
  const { data: crossOrder } = await clientB.from("orders").select("*").eq("id", orderId);
  if (crossOrder && crossOrder.length > 0) {
    throw new Error("SECURITY FAILURE: Customer B was able to view Customer A order!");
  }
  console.log("[PASS] Customer B cannot read Customer A order records (RLS enforced)");

  // 9. Order Cancellation & Exact-Once Stock Restoration
  console.log("\n9. Testing Order Cancellation & Stock Restoration (cancel_order_atomic)");
  const { data: cancelSuccess, error: cancelErr } = await clientA.rpc("cancel_order_atomic", {
    p_order_id: orderId,
    p_user_id: userA.id,
    p_cancel_reason: "Automated Phase 5C test cancellation",
  });

  if (cancelErr) throw cancelErr;
  if (!cancelSuccess) throw new Error("Order cancellation failed");

  // Verify stock restored back to initialStock
  const { data: bookRestored } = await clientA.from("books").select("stock").eq("id", testBook.id).single();
  if (bookRestored.stock !== initialStock) {
    throw new Error(`Stock restoration failure: Expected ${initialStock}, got ${bookRestored.stock}`);
  }
  console.log(`[PASS] Inventory restored back to ${bookRestored.stock} upon order cancellation`);

  // 10. Repeated Cancellation Replay Protection
  console.log("\n10. Testing Repeated Cancellation Replay Protection");
  const { error: replayErr } = await clientA.rpc("cancel_order_atomic", {
    p_order_id: orderId,
    p_user_id: userA.id,
    p_cancel_reason: "Replay attack test",
  });

  if (!replayErr) throw new Error("Replay cancellation was permitted!");
  console.log(`[PASS] Replay cancellation rejected with error: "${replayErr.message}"`);

  const { data: finalStockCheck } = await clientA.from("books").select("stock").eq("id", testBook.id).single();
  if (finalStockCheck.stock !== initialStock) {
    throw new Error("Replay cancellation altered stock!");
  }
  console.log("[PASS] Exact-once inventory restoration invariant verified");

  console.log("\n>>> ALL 10 PHASE 5C COMMERCE & ATOMICITY TESTS PASSED <<<");
}

runCommerceTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

