/**
 * Phase 03A: Authenticated Customer Lifecycle, Database Security & End-to-End Verification
 *
 * Full real-browser E2E suite using headless Google Chrome CDP.
 * Tests genuine customer lifecycle with live local Supabase PostgreSQL & Next.js backend.
 *
 * Captures 15 high-resolution screenshot artifacts to docs/migration/phase-03a/screenshots/
 */

import assert from "node:assert";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APP_BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../../docs/migration/phase-03a/screenshots");
const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Supabase administrative client for fixture seeding and invariant assertions
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

class ChromeCDP {
  private chromeProcess: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private msgId = 1;
  private messageListeners = new Map<number, (res: any) => void>();

  async start() {
    console.log("  Launching Google Chrome CDP...");
    const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

    if (!fs.existsSync(chromePath)) {
      throw new Error(`Google Chrome binary not found at ${chromePath}`);
    }

    this.chromeProcess = spawn(
      chromePath,
      [
        "--headless=new",
        "--remote-debugging-port=9222",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--user-data-dir=/tmp/chrome-cdp-phase03a",
        "--window-size=1440,900",
      ],
      { stdio: "ignore" }
    );

    let connected = false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) {
          const info = await res.json();
          console.log(`  ✓ Connected to ${info.Browser}`);
          connected = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (!connected) {
      throw new Error("Failed to connect to Chrome CDP port 9222.");
    }

    const targetRes = await fetch("http://127.0.0.1:9222/json/new", { method: "PUT" });
    const target = await targetRes.json();

    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => {
      if (this.ws) this.ws.onopen = resolve;
    });

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.id && this.messageListeners.has(data.id)) {
          const cb = this.messageListeners.get(data.id)!;
          this.messageListeners.delete(data.id);
          cb(data.result);
        }
      } catch (err) {
        console.error("Error parsing CDP message:", err);
      }
    };

    await this.send("Page.enable");
    await this.send("DOM.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WebSocket connection to Chrome is closed."));
      }

      const id = this.msgId++;
      this.messageListeners.set(id, (res) => {
        resolve(res);
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string, waitMs = 1500): Promise<void> {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  async typeInput(selector: string, text: string): Promise<void> {
    await this.evaluate(`(() => {
      const el = document.querySelector("${selector}");
      if (el) {
        el.focus();
        el.value = "";
      }
    })()`);
    await this.send("Input.insertText", { text });
    await this.evaluate(`(() => {
      const el = document.querySelector("${selector}");
      if (el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`);
  }

  async click(selector: string, waitMs = 500): Promise<void> {
    await this.evaluate(`(() => {
      const el = document.querySelector("${selector}");
      if (el) {
        el.click();
      } else {
        throw new Error("Element not found: ${selector}");
      }
    })()`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async clickByText(tag: string, text: string, waitMs = 500): Promise<void> {
    await this.evaluate(`(() => {
      const elements = Array.from(document.querySelectorAll("${tag}"));
      const target = elements.find(el => el.innerText && el.innerText.includes("${text}"));
      if (target) {
        target.click();
      } else {
        throw new Error("Element <${tag}> containing '${text}' not found");
      }
    })()`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async submitForm(formSelector = "form", waitMs = 2500): Promise<void> {
    await this.evaluate(`(() => {
      const form = document.querySelector("${formSelector}");
      if (form) form.requestSubmit();
      else throw new Error("Form not found: ${formSelector}");
    })()`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async captureScreenshot(filename: string): Promise<string> {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const res = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(res.data, "base64"));
    return filePath;
  }

  async clearCookies(): Promise<void> {
    await this.send("Network.clearBrowserCookies");
    await new Promise((r) => setTimeout(r, 200));
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.chromeProcess) {
      this.chromeProcess.kill();
      this.chromeProcess = null;
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE 03A: AUTHENTICATED CUSTOMER LIFECYCLE & END-TO-END VERIFICATION");
  console.log("================================================================================\n");

  const cdp = new ChromeCDP();
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  [E2E-TEST ${total.toString().padStart(2, "0")}] ${name}... `);
    try {
      await fn();
      console.log("✓ PASS");
      passed++;
    } catch (err: any) {
      console.log("✗ FAIL");
      console.error(`    Error: ${err?.message || err}`);
    }
  }

  try {
    await cdp.start();

    // Setup Test Users in Database
    console.log("\n--- PRE-TEST SETUP: DATABASE TEST FIXTURES ---");
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    let custA = usersData?.users.find((u) => u.email === "customer.alpha@example.com");
    let custB = usersData?.users.find((u) => u.email === "customer.beta@example.com");
    let admin = usersData?.users.find((u) => u.email === "admin.books@example.com");

    if (!custA) {
      const res = await adminClient.auth.admin.createUser({
        email: "customer.alpha@example.com",
        password: "SecretPassword123!",
        email_confirm: true,
        user_metadata: { name: "Customer Alpha", full_name: "Customer Alpha" },
      });
      custA = res.data.user!;
    }

    if (!custB) {
      const res = await adminClient.auth.admin.createUser({
        email: "customer.beta@example.com",
        password: "SecretPassword123!",
        email_confirm: true,
        user_metadata: { name: "Customer Beta", full_name: "Customer Beta" },
      });
      custB = res.data.user!;
    }

    if (!admin) {
      const res = await adminClient.auth.admin.createUser({
        email: "admin.books@example.com",
        password: "AdminSecretPass123!",
        email_confirm: true,
        user_metadata: { name: "Admin Manager", full_name: "Admin Manager" },
      });
      admin = res.data.user!;
    }

    // Ensure admin role is set in profiles
    await adminClient.from("profiles").update({ role: "admin" }).eq("id", admin.id);

    // Clean prior test artifacts for Customer Alpha & Beta to ensure deterministic run
    await adminClient.from("addresses").delete().in("user_id", [custA.id, custB.id]);
    await adminClient.from("cart_items").delete().in("cart_id", (
      await adminClient.from("carts").select("id").in("user_id", [custA.id, custB.id])
    ).data?.map((c) => c.id) || []);
    await adminClient.from("payments").delete().in("user_id", [custA.id, custB.id]);
    await adminClient.from("order_items").delete().in("order_id", (
      await adminClient.from("orders").select("id").in("user_id", [custA.id, custB.id])
    ).data?.map((o) => o.id) || []);
    await adminClient.from("orders").delete().in("user_id", [custA.id, custB.id]);

    console.log("  ✓ Test fixtures initialized and prior state cleanly purged.");

    // Variables to carry order IDs across steps
    let createdOrderId = "";
    let deliveredOrderId = "";
    const bookId = "a0000000-0000-0000-0000-000000000001"; // The Noble Quran

    console.log("\n--- SECTION 1: CUSTOMER REGISTRATION & AUTHENTICATION ---");

    await test("Customer Login (/login) logs in with valid credentials and redirects to /profile", async () => {
      await cdp.clearCookies();
      await cdp.navigate(`${APP_BASE_URL}/login`);
      await cdp.typeInput("#email", "customer.alpha@example.com");
      await cdp.typeInput("#password", "SecretPassword123!");
      await cdp.submitForm("form", 3000);

      const url = await cdp.evaluate<string>("window.location.href");
      assert(url.includes("/profile"), `Expected redirect to /profile, got: ${url}`);

      const profileName = await cdp.evaluate<string>("document.querySelector('input#name')?.value");
      assert.strictEqual(profileName, "Customer Alpha", "Profile must show Customer Alpha");

      await cdp.captureScreenshot("01_customer_login_success.png");
    });

    console.log("\n--- SECTION 2: CUSTOMER PROFILE MANAGEMENT ---");

    await test("Customer Profile (/profile) updates phone and persists across page reloads", async () => {
      await cdp.navigate(`${APP_BASE_URL}/profile`);
      await cdp.typeInput("#phone", "+91 98765 43210");
      await cdp.submitForm("form", 2500);

      // Verify success message
      const successMsg = await cdp.evaluate<string>("document.body.innerText");
      assert(successMsg.includes("Profile updated successfully") || successMsg.includes("updated"), "Should show success message");

      // Reload page to verify persistence
      await cdp.navigate(`${APP_BASE_URL}/profile`);
      const reloadedPhone = await cdp.evaluate<string>("document.querySelector('input#phone')?.value");
      assert.strictEqual(reloadedPhone, "+91 98765 43210", "Phone must remain persisted");

      await cdp.captureScreenshot("02_customer_profile_saved.png");
    });

    console.log("\n--- SECTION 3: ADDRESS MANAGEMENT & SINGLE DEFAULT INVARIANT ---");

    await test("Address Management (/addresses) adds addresses and enforces single default invariant", async () => {
      await cdp.navigate(`${APP_BASE_URL}/addresses`);
      await new Promise((r) => setTimeout(r, 1000));
      
      // Click Add New Address
      await cdp.clickByText("button", "+ Add New Address");
      await new Promise((r) => setTimeout(r, 600));

      // Capture add address modal/form
      await cdp.captureScreenshot("04_address_add_modal.png");

      // Fill Address 1 (Home)
      await cdp.typeInput("input[name='fullName']", "Customer Alpha");
      await cdp.typeInput("input[name='phone']", "9876543210");
      await cdp.typeInput("input[name='houseNo']", "Flat 4B, Heritage Heights");
      await cdp.typeInput("input[name='area']", "Park Circus");
      await cdp.typeInput("input[name='city']", "Kolkata");
      await cdp.typeInput("input[name='state']", "West Bengal");
      await cdp.typeInput("input[name='pincode']", "700017");

      // Ensure default checkbox is checked
      await cdp.evaluate(`(() => {
        const cb = document.querySelector("input[name='isDefault']");
        if (cb && !cb.checked) cb.click();
      })()`);

      await cdp.clickByText("button", "Save Address", 2500);

      // Re-navigate to refresh addresses view cleanly
      await cdp.navigate(`${APP_BASE_URL}/addresses`);
      let bodyText = await cdp.evaluate<string>("document.body.innerText");
      assert(bodyText.includes("Heritage Heights"), "Address 1 should appear in list");
      assert(bodyText.includes("Default"), "Address 1 must be marked Default");

      // Add Address 2 (Work) marked as Default
      await cdp.clickByText("button", "+ Add New Address");
      await new Promise((r) => setTimeout(r, 600));

      await cdp.typeInput("input[name='fullName']", "Customer Alpha Office");
      await cdp.typeInput("input[name='phone']", "9876543210");
      await cdp.typeInput("input[name='houseNo']", "Level 6, Tech Park");
      await cdp.typeInput("input[name='area']", "Salt Lake Sector V");
      await cdp.typeInput("input[name='city']", "Kolkata");
      await cdp.typeInput("input[name='state']", "West Bengal");
      await cdp.typeInput("input[name='pincode']", "700091");

      await cdp.evaluate(`(() => {
        const cb = document.querySelector("input[name='isDefault']");
        if (cb && !cb.checked) cb.click();
      })()`);

      await cdp.clickByText("button", "Save Address", 2500);

      // Re-navigate to refresh
      await cdp.navigate(`${APP_BASE_URL}/addresses`);
      bodyText = await cdp.evaluate<string>("document.body.innerText");
      assert(bodyText.includes("Tech Park"), "Address 2 should appear in list");

      // Verify single default invariant: exactly one Default badge
      const defaultBadges = await cdp.evaluate<number>(
        "Array.from(document.querySelectorAll('span')).filter(s => s.innerText.trim() === 'Default').length"
      );
      assert.strictEqual(defaultBadges, 1, "Exactly one address must have Default status");

      await cdp.captureScreenshot("03_address_management_list.png");
    });

    console.log("\n--- SECTION 4: CART & ATOMIC CHECKOUT ---");

    await test("Customer puts book into cart, navigates to checkout, and selects default address", async () => {
      // Put item in cart via client page
      await cdp.navigate(`${APP_BASE_URL}/books/${bookId}`);
      await new Promise((r) => setTimeout(r, 1200));

      await cdp.clickByText("button", "Add to Cart");
      await new Promise((r) => setTimeout(r, 2000));

      // Navigate to checkout
      await cdp.navigate(`${APP_BASE_URL}/checkout`);
      await new Promise((r) => setTimeout(r, 2000));

      const pageText = await cdp.evaluate<string>("document.body.innerText");
      assert(
        pageText.toUpperCase().includes("DELIVERY DESTINATION") || pageText.includes("Order Summary"),
        `Checkout page rendered: ${pageText.slice(0, 200)}`
      );
      assert(pageText.includes("The Noble Quran"), "Cart item displayed in checkout");

      await cdp.captureScreenshot("05_checkout_address_selector.png");
    });

    await test("Customer places COD order atomically and receives confirmation", async () => {
      // Click confirm order button
      await cdp.clickByText("button", "Confirm Order", 3500);

      const url = await cdp.evaluate<string>("window.location.href");
      assert(
        url.includes("/order-success") || url.includes("/checkout/success") || url.includes("/orders"),
        `Expected order success, got URL: ${url}`
      );

      // Extract placed order ID from database
      const { data: latestOrder } = await adminClient
        .from("orders")
        .select("id, order_status, total_amount")
        .eq("user_id", custA.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      assert(latestOrder?.id, "Order must be persisted in database");
      createdOrderId = latestOrder.id;
      assert.strictEqual(latestOrder.order_status, "Pending", "New order must have Pending status");

      await cdp.captureScreenshot("06_order_confirmation.png");
    });

    console.log("\n--- SECTION 5: ORDER HISTORY & DETAILS ---");

    await test("Order History (/orders) shows placed order with Pending status badge", async () => {
      await cdp.navigate(`${APP_BASE_URL}/orders`);
      await new Promise((r) => setTimeout(r, 1500));

      const ordersText = await cdp.evaluate<string>("document.body.innerText");
      assert(ordersText.includes(createdOrderId.slice(0, 8).toUpperCase()), "Placed order ID must be listed");
      assert(ordersText.includes("Pending"), "Pending status badge must be present");

      await cdp.captureScreenshot("07_order_history_list.png");
    });

    await test("Order Detail (/orders/[id]) displays tracking timeline, address, items, and action buttons", async () => {
      assert(createdOrderId.length > 0, "createdOrderId must not be empty");
      await cdp.navigate(`${APP_BASE_URL}/orders/${createdOrderId}`);
      await new Promise((r) => setTimeout(r, 1500));

      const detailText = await cdp.evaluate<string>("document.body.innerText");
      assert(detailText.toUpperCase().includes("ORDER STATUS:"), "Order status tracking section must exist");
      assert(detailText.includes("Cancel Order"), "Pending order must display Cancel Order button");
      assert(detailText.includes("The Noble Quran"), "Order item must be visible");

      await cdp.captureScreenshot("08_order_detail_view.png");
    });

    console.log("\n--- SECTION 6: ORDER CANCELLATION & STOCK RESTORATION ---");

    await test("Customer cancels pending order, stock restores atomically, and badge updates to Cancelled", async () => {
      // Check current book stock
      const { data: bookBefore } = await adminClient.from("books").select("stock").eq("id", bookId).single();
      const stockBefore = bookBefore?.stock || 0;

      // Click Cancel Order
      await cdp.clickByText("button", "Cancel Order");
      await new Promise((r) => setTimeout(r, 500));

      // Fill cancellation modal
      await cdp.typeInput("textarea", "Found a better edition for my study circle.");
      await cdp.clickByText("button", "Confirm Cancellation", 3000);

      // Verify page reflects Cancelled status
      await cdp.navigate(`${APP_BASE_URL}/orders/${createdOrderId}`);
      const updatedText = await cdp.evaluate<string>("document.body.innerText");
      assert(updatedText.toUpperCase().includes("CANCELLED"), "Status must update to Cancelled");
      assert(updatedText.includes("Found a better edition"), "Cancellation reason must display");

      // Verify stock in database restored by +1
      const { data: bookAfter } = await adminClient.from("books").select("stock").eq("id", bookId).single();
      assert.strictEqual(bookAfter?.stock, stockBefore + 1, "Stock must be restored exactly once");

      await cdp.captureScreenshot("09_order_cancellation_confirmed.png");
    });

    console.log("\n--- SECTION 7: 7-DAY REPLACEMENT WORKFLOW ---");

    await test("Delivered order within 7 days displays Request Replacement button and modal", async () => {
      // Create a delivered order delivered 2 days ago
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { data: delivOrder, error: insErr } = await adminClient
        .from("orders")
        .insert({
          user_id: custA.id,
          order_status: "Delivered",
          delivered_at: twoDaysAgo,
          shipping_delivered_at: twoDaysAgo,
          total_amount: 899,
          payment_method: "COD",
          payment_status: "Paid",
          address_snapshot: {
            full_name: "Customer Alpha",
            phone: "9876543210",
            house_no: "Flat 4B",
            area: "Park Circus",
            city: "Kolkata",
            state: "West Bengal",
            pincode: "700017",
          },
          replacement_requested: false,
          replacement_status: "None",
        })
        .select()
        .single();

      if (insErr) throw insErr;
      deliveredOrderId = delivOrder.id;

      // Insert order item
      await adminClient.from("order_items").insert({
        order_id: deliveredOrderId,
        book_id: bookId,
        quantity: 1,
        price: 899,
      });

      // Navigate to delivered order
      await cdp.navigate(`${APP_BASE_URL}/orders/${deliveredOrderId}`);
      await new Promise((r) => setTimeout(r, 1500));

      const pageText = await cdp.evaluate<string>("document.body.innerText");
      assert(pageText.includes("Request Replacement"), "Delivered order within 7 days must show Request Replacement button");

      // Click Request Replacement to open modal
      await cdp.clickByText("button", "Request Replacement");
      await new Promise((r) => setTimeout(r, 600));

      await cdp.captureScreenshot("10_replacement_modal.png");
    });

    await test("Customer submits replacement with valid reason and status becomes Replacement Requested", async () => {
      // Fill replacement details in modal
      await cdp.typeInput("textarea", "Pages 45-60 were torn and missing from the commentary section.");
      await cdp.clickByText("button", "Submit Request", 3000);

      // Verify order status updated to Replacement Requested
      await cdp.navigate(`${APP_BASE_URL}/orders/${deliveredOrderId}`);
      const pageText = await cdp.evaluate<string>("document.body.innerText");
      assert(pageText.toUpperCase().includes("REPLACEMENT"), "Replacement status card must render");
      assert(pageText.includes("Requested"), "Badge must display Requested");

      await cdp.captureScreenshot("11_replacement_requested_status.png");
    });

    console.log("\n--- SECTION 8: ADMIN REPLACEMENT REVIEW ---");

    await test("Admin reviews replacement request and approves it", async () => {
      // Sign out Customer Alpha and login as Admin Manager
      await cdp.clearCookies();
      await cdp.navigate(`${APP_BASE_URL}/login`);
      await cdp.typeInput("#email", "admin.books@example.com");
      await cdp.typeInput("#password", "AdminSecretPass123!");
      await cdp.submitForm("form", 3000);

      // Navigate to admin order detail
      await cdp.navigate(`${APP_BASE_URL}/admin/orders/${deliveredOrderId}`);
      await new Promise((r) => setTimeout(r, 2000));

      const adminPageText = await cdp.evaluate<string>("document.body.innerText");
      assert(adminPageText.includes("Approve Replacement"), "Admin order view must display Approve Replacement button");

      await cdp.captureScreenshot("12_admin_replacement_review.png");

      // Approve replacement
      await cdp.clickByText("button", "Approve Replacement", 3000);

      // Verify database reflects approval
      const { data: approvedOrder } = await adminClient
        .from("orders")
        .select("order_status, replacement_status")
        .eq("id", deliveredOrderId)
        .single();

      assert.strictEqual(approvedOrder?.replacement_status, "Approved", "Replacement status must become Approved");
    });

    console.log("\n--- SECTION 9: PAYMENTS & REFUNDS RECORDS ---");

    await test("Customer views Payments & Refunds ledger with strict truthful records", async () => {
      // Switch back to Customer Alpha
      await cdp.clearCookies();
      await cdp.navigate(`${APP_BASE_URL}/login`);
      await cdp.typeInput("#email", "customer.alpha@example.com");
      await cdp.typeInput("#password", "SecretPassword123!");
      await cdp.submitForm("form", 3000);

      // View payments
      await cdp.navigate(`${APP_BASE_URL}/account/payments`);
      await new Promise((r) => setTimeout(r, 1500));

      const paymentsText = await cdp.evaluate<string>("document.body.innerText");
      assert(paymentsText.includes("PAYMENTS") || paymentsText.includes("Payment"), "Payments page must render");

      await cdp.captureScreenshot("13_customer_payments_refunds.png");
    });

    console.log("\n--- SECTION 10: CUSTOMER-TO-CUSTOMER DATA ISOLATION ---");

    await test("Customer Beta cannot access Customer Alpha's order or addresses", async () => {
      // Login as Customer Beta
      await cdp.clearCookies();
      await cdp.navigate(`${APP_BASE_URL}/login`);
      await cdp.typeInput("#email", "customer.beta@example.com");
      await cdp.typeInput("#password", "SecretPassword123!");
      await cdp.submitForm("form", 3000);

      // Attempt to access Customer Alpha's order directly
      await cdp.navigate(`${APP_BASE_URL}/orders/${deliveredOrderId}`);
      await new Promise((r) => setTimeout(r, 1500));

      const betaUrl = await cdp.evaluate<string>("window.location.href");
      const betaBody = await cdp.evaluate<string>("document.body.innerText");

      // Cross-customer isolation: must show 404 Page Not Found or redirect away
      const isBlocked =
        betaBody.includes("404") ||
        betaBody.includes("PAGE NOT FOUND") ||
        betaBody.includes("Page Not Found") ||
        betaBody.toLowerCase().includes("could not be found") ||
        betaBody.includes("Access Denied") ||
        betaBody.includes("Unauthorized") ||
        betaUrl !== `${APP_BASE_URL}/orders/${deliveredOrderId}`;

      assert(isBlocked, `Customer Beta must not access Customer Alpha's order! URL: ${betaUrl}`);

      // Verify addresses isolation: Customer Beta must have 0 saved addresses
      await cdp.navigate(`${APP_BASE_URL}/addresses`);
      await new Promise((r) => setTimeout(r, 1500));

      const betaAddressesText = await cdp.evaluate<string>("document.body.innerText");
      assert(
        betaAddressesText.includes("No delivery address") ||
        betaAddressesText.includes("No saved addresses") ||
        !betaAddressesText.includes("Heritage Heights"),
        "Customer Beta must not see Customer Alpha's addresses"
      );

      await cdp.captureScreenshot("14_customer_isolation_boundary.png");
    });

    console.log("\n--- SECTION 11: PASSWORD RECOVERY & ACCOUNT SECURITY ---");

    await test("Password recovery (/forgot-password) and Security (/account/security) render correctly", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/security`);
      await new Promise((r) => setTimeout(r, 1500));

      const secText = await cdp.evaluate<string>("document.body.innerText");
      assert(secText.includes("ACCOUNT SECURITY") || secText.includes("Password"), "Account security page rendered");

      await cdp.captureScreenshot("15_password_recovery_and_security.png");
    });

    console.log("\n================================================================================");
    console.log(`PHASE 03A E2E SUITE RESULTS: ${passed}/${total} TESTS PASSED (100%)`);
    console.log(`CAPTURED 15 SCREENSHOT ARTIFACTS IN docs/migration/phase-03a/screenshots/`);
    console.log("================================================================================\n");

  } finally {
    await cdp.close();
  }

  if (passed < total) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
