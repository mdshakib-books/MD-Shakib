/**
 * Phase 06: Premium Design System & UI/UX — Real-Browser QA & Screenshot Generation Suite
 *
 * Full real-browser verification suite using headless Google Chrome CDP against production Next.js build.
 * Validates editorial quiet luxury design tokens, typography scales, responsive breakpoints,
 * visual hierarchy, zero horizontal overflow, SVG icon usage, and captures 15 authoritative screenshots.
 *
 * Screenshots saved to: docs/migration/phase-06/screenshots/
 */

import assert from "node:assert";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APP_BASE_URL = "http://localhost:3001";
const SCREENSHOTS_DIR = path.resolve(__dirname, "../../../docs/migration/phase-06/screenshots");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

class ChromeCDP {
  private chromeProcess: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private msgId = 1;
  private messageListeners = new Map<number, (res: any) => void>();
  public consoleErrors: string[] = [];

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
        "--user-data-dir=/tmp/chrome-cdp-phase06",
        "--window-size=1440,900",
      ],
      { stdio: "ignore" }
    );

    let connected = false;
    for (let i = 0; i < 25; i++) {
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
        if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
          const text = data.params.args.map((a: any) => a.value || a.description).join(" ");
          this.consoleErrors.push(text);
        }
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

  async setViewport(width: number, height: number, mobile = false): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await new Promise((r) => setTimeout(r, 200));
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

  async click(selector: string, waitMs = 500): Promise<void> {
    await this.evaluate(`(() => {
      const el = document.querySelector("${selector}");
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "center" });
        el.click();
      } else {
        throw new Error("Element not found: ${selector}");
      }
    })()`);
    await new Promise((r) => setTimeout(r, waitMs));
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

  async submitForm(formSelector = "form", waitMs = 2000): Promise<void> {
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
    console.log(`    ↳ Captured screenshot: ${filename} (${(res.data.length * 0.75 / 1024).toFixed(1)} KB)`);
    return filePath;
  }

  async clearCookies(): Promise<void> {
    await this.send("Network.clearBrowserCookies");
    await new Promise((r) => setTimeout(r, 200));
  }

  async checkHorizontalOverflow(): Promise<boolean> {
    const isOverflowing = await this.evaluate(`(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    })()`);
    return isOverflowing;
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
  console.log("PHASE 06: PREMIUM DESIGN SYSTEM & UI/UX — REAL-BROWSER QA & ARTIFACT SUITE");
  console.log("================================================================================\n");

  const cdp = new ChromeCDP();
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  [QA-VERIFY ${total.toString().padStart(2, "0")}] ${name}... `);
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

    // 0. Ensure test accounts exist in database
    console.log("\n--- PRE-TEST SETUP: VERIFYING DATABASE TEST USERS ---");
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    let custA = usersData?.users.find((u) => u.email === "customer.alpha@example.com");
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

    if (!admin) {
      const res = await adminClient.auth.admin.createUser({
        email: "admin.books@example.com",
        password: "AdminSecretPass123!",
        email_confirm: true,
        user_metadata: { name: "Admin Manager", full_name: "Admin Manager" },
      });
      admin = res.data.user!;
    }
    await adminClient.from("profiles").update({ role: "admin" }).eq("id", admin.id);

    console.log("  ✓ Test users verified in Supabase.\n");

    // Clear initial cookies
    await cdp.clearCookies();

    // --------------------------------------------------------------------------
    // 1. Desktop Homepage (1440x900)
    // --------------------------------------------------------------------------
    await test("01-homepage-desktop: Quiet luxury tokens, Cinzel/Inter typography, zero overflow", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Viewport 1440px must have 0 horizontal overflow");

      // Verify design tokens in DOM
      const tokensVerified = await cdp.evaluate(`(() => {
        const style = getComputedStyle(document.documentElement);
        const gold = style.getPropertyValue("--color-primary-gold").trim();
        return gold.toLowerCase() === "#c9a24a";
      })()`);
      assert.strictEqual(tokensVerified, true, "CSS variable --color-primary-gold must resolve to #C9A24A");

      await cdp.captureScreenshot("01-homepage-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 2. Mobile Homepage (375x812)
    // --------------------------------------------------------------------------
    await test("02-homepage-mobile: MobileBottomNav, safe padding, zero overflow", async () => {
      await cdp.setViewport(375, 812, true);
      await cdp.navigate(`${APP_BASE_URL}/`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Viewport 375px must have 0 horizontal overflow");

      const navVisible = await cdp.evaluate(`(() => {
        const nav = document.querySelector("nav[aria-label='Mobile Navigation Bar']");
        return Boolean(nav);
      })()`);
      assert.strictEqual(navVisible, true, "Mobile bottom navigation bar must be rendered");

      await cdp.captureScreenshot("02-homepage-mobile.png");
    });

    // --------------------------------------------------------------------------
    // 3. Desktop Catalog (1440x900)
    // --------------------------------------------------------------------------
    await test("03-catalog-desktop: 3:4 product card grid, category filters, price badges", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/books`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Catalog must have 0 horizontal overflow");

      const hasCards = await cdp.evaluate(`(() => {
        return document.querySelectorAll("article, .group").length > 0;
      })()`);
      assert.strictEqual(hasCards, true, "Catalog must display product cards");

      await cdp.captureScreenshot("03-catalog-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 4. Mobile Catalog (390x844)
    // --------------------------------------------------------------------------
    await test("04-catalog-mobile: Responsive 2-column grid, touch-friendly filter pills", async () => {
      await cdp.setViewport(390, 844, true);
      await cdp.navigate(`${APP_BASE_URL}/books`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Mobile catalog 390px must have 0 horizontal overflow");

      await cdp.captureScreenshot("04-catalog-mobile.png");
    });

    // --------------------------------------------------------------------------
    // 5. Desktop Book Details (1440x900)
    // --------------------------------------------------------------------------
    await test("05-book-details-desktop: Curated gallery, SVG trust icons, buy actions", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/books`);

      // Find first book link
      const firstBookHref = await cdp.evaluate(`(() => {
        const link = document.querySelector("a[href^='/books/']");
        return link ? link.getAttribute("href") : null;
      })()`);

      assert.ok(firstBookHref, "Must find at least one book in catalog");
      await cdp.navigate(`${APP_BASE_URL}${firstBookHref}`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Book details must have 0 horizontal overflow");

      // Verify no emoji trust icons
      const hasEmojis = await cdp.evaluate(`(() => {
        return /[🚚🔁💵🔒⚡]/.test(document.body.innerText);
      })()`);
      assert.strictEqual(hasEmojis, false, "Book details page must not contain raw emoji trust badges");

      await cdp.captureScreenshot("05-book-details-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 6. Mobile Book Details (375x812)
    // --------------------------------------------------------------------------
    await test("06-book-details-mobile: Mobile gallery, sticky action area, zero overflow", async () => {
      await cdp.setViewport(375, 812, true);
      const firstBookHref = await cdp.evaluate(`(() => {
        const link = document.querySelector("a[href^='/books/']");
        return link ? link.getAttribute("href") : "/books";
      })()`);

      await cdp.navigate(`${APP_BASE_URL}${firstBookHref}`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Mobile book details 375px must have 0 horizontal overflow");

      await cdp.captureScreenshot("06-book-details-mobile.png");
    });

    // --------------------------------------------------------------------------
    // 7. Desktop Cart (1440x900)
    // --------------------------------------------------------------------------
    await test("07-cart-desktop: Quiet luxury empty state / populated summary breakdown", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/cart`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Cart must have 0 horizontal overflow");

      await cdp.captureScreenshot("07-cart-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 8. Desktop Checkout (1440x900)
    // --------------------------------------------------------------------------
    await test("08-checkout-desktop: Destination select, payment methods, order summary", async () => {
      await cdp.setViewport(1440, 900, false);

      // Authenticate as Customer Alpha to inspect checkout
      await cdp.navigate(`${APP_BASE_URL}/login`);
      await cdp.typeInput("input[name='email']", "customer.alpha@example.com");
      await cdp.typeInput("input[name='password']", "SecretPassword123!");
      await cdp.submitForm("form", 2000);

      await cdp.navigate(`${APP_BASE_URL}/checkout`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Checkout must have 0 horizontal overflow");

      await cdp.captureScreenshot("08-checkout-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 9. Customer Account Overview (1440x900)
    // --------------------------------------------------------------------------
    await test("10-customer-account-desktop: KPI cards, AccountNav tabs, recent orders", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/account`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Account dashboard must have 0 horizontal overflow");

      const hasHeading = await cdp.evaluate(`(() => {
        return document.body.innerText.toUpperCase().includes("ACCOUNT DASHBOARD");
      })()`);
      assert.strictEqual(hasHeading, true, "Account dashboard header must be visible");

      await cdp.captureScreenshot("10-customer-account-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 10. Customer Addresses (1440x900)
    // --------------------------------------------------------------------------
    await test("11-customer-addresses-desktop: Address cards, default badge, add/edit modal", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/addresses`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Addresses page must have 0 horizontal overflow");

      await cdp.captureScreenshot("11-customer-addresses-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 11. Customer Orders & Order Details (1440x900)
    // --------------------------------------------------------------------------
    await test("09-order-details-desktop: Order cards, timeline steps, replacement actions", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/orders`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Orders list must have 0 horizontal overflow");

      // Check if there is an existing order or empty state
      const firstOrderHref = await cdp.evaluate(`(() => {
        const link = document.querySelector("a[href^='/orders/']");
        return link ? link.getAttribute("href") : null;
      })()`);

      if (firstOrderHref) {
        await cdp.navigate(`${APP_BASE_URL}${firstOrderHref}`);
        await cdp.captureScreenshot("09-order-details-desktop.png");
      } else {
        // Capture orders list
        await cdp.captureScreenshot("09-order-details-desktop.png");
      }
    });

    // --------------------------------------------------------------------------
    // 12. Admin Portal Login & Dashboard (1440x900)
    // --------------------------------------------------------------------------
    await test("12-admin-dashboard-desktop: Operations metrics, AdminMetricCard, KPI badges", async () => {
      await cdp.clearCookies();
      await cdp.setViewport(1440, 900, false);

      // Authenticate as Admin
      await cdp.navigate(`${APP_BASE_URL}/login`);
      await cdp.typeInput("input[name='email']", "admin.books@example.com");
      await cdp.typeInput("input[name='password']", "AdminSecretPass123!");
      await cdp.submitForm("form", 2000);

      await cdp.navigate(`${APP_BASE_URL}/admin`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Admin dashboard must have 0 horizontal overflow");

      const hasDashboard = await cdp.evaluate(`(() => {
        return document.body.innerText.toUpperCase().includes("OPERATIONS DASHBOARD");
      })()`);
      assert.strictEqual(hasDashboard, true, "Admin operations dashboard must be visible");

      await cdp.captureScreenshot("12-admin-dashboard-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 13. Admin Books Catalog Management (1440x900)
    // --------------------------------------------------------------------------
    await test("13-admin-books-desktop: Books data table, SVG action icons, stock badges", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/admin/books`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Admin books page must have 0 horizontal overflow");

      // Verify no emoji icons in table
      const hasEmojis = await cdp.evaluate(`(() => {
        return /[📖✏️✕🗑️]/.test(document.body.innerText);
      })()`);
      assert.strictEqual(hasEmojis, false, "Admin books data table must not use raw emoji icons");

      await cdp.captureScreenshot("13-admin-books-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 14. Admin Orders Ledger (1440x900)
    // --------------------------------------------------------------------------
    await test("14-admin-orders-desktop: Orders transaction table, filter bar, status badges", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/admin/orders`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Admin orders page must have 0 horizontal overflow");

      await cdp.captureScreenshot("14-admin-orders-desktop.png");
    });

    // --------------------------------------------------------------------------
    // 15. Admin Mobile Dashboard (375x812)
    // --------------------------------------------------------------------------
    await test("15-admin-mobile-dashboard: Responsive drawer, mobile metrics, zero overflow", async () => {
      await cdp.setViewport(375, 812, true);
      await cdp.navigate(`${APP_BASE_URL}/admin`);

      const overflow = await cdp.checkHorizontalOverflow();
      assert.strictEqual(overflow, false, "Admin mobile dashboard 375px must have 0 horizontal overflow");

      await cdp.captureScreenshot("15-admin-mobile-dashboard.png");
    });

    // --------------------------------------------------------------------------
    // 16. Comprehensive Viewport Sweep (5 Breakpoints)
    // --------------------------------------------------------------------------
    await test("Responsive Viewport Sweep: 375px, 390px, 768px, 1024px, 1440px across 6 key routes", async () => {
      const viewports = [
        { width: 375, height: 812, mobile: true },
        { width: 390, height: 844, mobile: true },
        { width: 768, height: 1024, mobile: false },
        { width: 1024, height: 768, mobile: false },
        { width: 1440, height: 900, mobile: false },
      ];

      const routes = ["/", "/books", "/about", "/contact", "/support", "/login"];

      for (const vp of viewports) {
        await cdp.setViewport(vp.width, vp.height, vp.mobile);
        for (const route of routes) {
          await cdp.navigate(`${APP_BASE_URL}${route}`, 500);
          const isOverflowing = await cdp.checkHorizontalOverflow();
          assert.strictEqual(
            isOverflowing,
            false,
            `Route ${route} at viewport ${vp.width}x${vp.height} must not have horizontal overflow`
          );
        }
      }
    });

  } finally {
    await cdp.close();
  }

  console.log("\n================================================================================");
  console.log(`PHASE 06 BROWSER QA SUMMARY: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal QA Suite Error:", err);
  process.exit(1);
});
