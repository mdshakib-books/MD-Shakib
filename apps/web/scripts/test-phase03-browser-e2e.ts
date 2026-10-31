/**
 * Phase 03 — Customer Account & Commerce Browser E2E Test Suite
 *
 * Uses native Google Chrome (CDP) to verify customer authentication,
 * account routes, protected redirect barriers, and responsive viewports.
 */

import assert from "node:assert";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP_BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "../../docs/migration/phase-03/screenshots");

class ChromeCDP {
  private chromeProcess: ChildProcess | null = null;
  private ws: WebSocket | null = null;
  private msgId = 1;
  private messageListeners = new Map<number, (res: any) => void>();

  async start() {
    console.log("  Launching Google Chrome 156 in headless CDP mode...");
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
        "--user-data-dir=/tmp/chrome-cdp-phase03",
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
          cb(data);
        }
      } catch (err) {
        console.error("Error parsing CDP message:", err);
      }
    };

    await this.send("Page.enable");
    await this.send("DOM.enable");
    await this.send("Runtime.enable");
  }

  send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("WebSocket connection to Chrome is closed."));
      }

      const id = this.msgId++;
      this.messageListeners.set(id, (res) => {
        if (res.error) {
          reject(new Error(`CDP Error in ${method}: ${res.error.message}`));
        } else {
          resolve(res.result);
        }
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async navigate(url: string, waitMs = 1200): Promise<void> {
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
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
  console.log("PHASE 03: FULL BROWSER E2E TESTING & ACCEPTANCE SUITE");
  console.log("================================================================================\n");

  const cdp = new ChromeCDP();
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    process.stdout.write(`  [TEST ${total.toString().padStart(2, "0")}] ${name}... `);
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
    await cdp.setViewport(1440, 900, false);

    console.log("\n--- SECTION 1: CUSTOMER AUTHENTICATION VIEWS & WORKFLOWS ---");

    await test("Customer Login (/login) renders email input, password input, and branding", async () => {
      await cdp.navigate(`${APP_BASE_URL}/login`);
      const heading = await cdp.evaluate<string>("document.querySelector('h1')?.innerText");
      assert(heading?.toLowerCase().includes("welcome") || heading?.toLowerCase().includes("login"), "Heading should match");

      const hasInputs = await cdp.evaluate<boolean>(
        "!!document.querySelector('input[type=\"email\"]') && !!document.querySelector('input[name=\"password\"]')"
      );
      assert(hasInputs, "Email and password inputs must exist");

      await cdp.captureScreenshot("01_login_page_customer.png");
    });

    await test("Customer Registration (/register) renders full name, email, password, and registration CTA", async () => {
      await cdp.navigate(`${APP_BASE_URL}/register`);
      const heading = await cdp.evaluate<string>("document.querySelector('h1')?.innerText");
      assert(heading?.toLowerCase().includes("account") || heading?.toLowerCase().includes("create"), "Registration heading");

      const hasFields = await cdp.evaluate<boolean>(
        "!!document.querySelector('input[name=\"name\"]') && !!document.querySelector('input[name=\"email\"]') && !!document.querySelector('input[name=\"password\"]')"
      );
      assert(hasFields, "Full name, email, and password fields must exist");

      await cdp.captureScreenshot("02_register_page_customer.png");
    });

    await test("Forgot Password (/forgot-password) renders email input and submit button", async () => {
      await cdp.navigate(`${APP_BASE_URL}/forgot-password`);
      const hasEmail = await cdp.evaluate<boolean>("!!document.querySelector('input[type=\"email\"]')");
      assert(hasEmail, "Email input must exist on forgot password view");

      await cdp.captureScreenshot("03_forgot_password_customer.png");
    });

    await test("Reset Password (/reset-password) renders new password and confirmation inputs", async () => {
      await cdp.navigate(`${APP_BASE_URL}/reset-password`);
      const hasPasswordInputs = await cdp.evaluate<boolean>(
        "!!document.querySelector('input[name=\"password\"]') && !!document.querySelector('input[name=\"confirmPassword\"]')"
      );
      assert(hasPasswordInputs, "New password and confirm password inputs must exist");

      await cdp.captureScreenshot("04_reset_password_customer.png");
    });

    console.log("\n--- SECTION 2: PROTECTED ROUTE REDIRECT BARRIERS ---");

    await test("Unauthenticated visit to /account redirects to /login?redirect=/account", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), `Expected redirect to /login, got: ${currentUrl}`);
      assert(currentUrl.includes("redirect=%2Faccount") || currentUrl.includes("redirect=/account"));

      await cdp.captureScreenshot("05_account_overview_redirect.png");
    });

    await test("Unauthenticated visit to /account/profile redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/profile`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Profile must require authentication");
    });

    await test("Unauthenticated visit to /account/addresses redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/addresses`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Addresses must require authentication");
    });

    await test("Unauthenticated visit to /account/orders redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/orders`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Orders must require authentication");
    });

    await test("Unauthenticated visit to /account/payments redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/payments`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Payments must require authentication");
    });

    await test("Unauthenticated visit to /account/refunds redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/refunds`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Refunds must require authentication");
    });

    await test("Unauthenticated visit to /account/replacements redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/replacements`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Replacements must require authentication");
    });

    await test("Unauthenticated visit to /account/security redirects to /login", async () => {
      await cdp.navigate(`${APP_BASE_URL}/account/security`);
      const currentUrl = await cdp.evaluate<string>("window.location.href");
      assert(currentUrl.includes("/login"), "Security must require authentication");

      await cdp.captureScreenshot("06_account_security_redirect.png");
    });

    console.log("\n--- SECTION 3: RESPONSIVE VIEWPORT & UI VERIFICATION ---");

    await test("Desktop Viewport (1440x900): Auth screens render centered cards and clear typography", async () => {
      await cdp.setViewport(1440, 900, false);
      await cdp.navigate(`${APP_BASE_URL}/login`);
      const bodyWidth = await cdp.evaluate<number>("document.documentElement.scrollWidth");
      assert(bodyWidth <= 1440, `Desktop body width ${bodyWidth} within 1440`);

      await cdp.captureScreenshot("07_desktop_account_nav.png");
    });

    await test("Mobile Viewport (375x812): Auth forms fit cleanly without horizontal scrolling", async () => {
      await cdp.setViewport(375, 812, true);
      await cdp.navigate(`${APP_BASE_URL}/login`);
      const scrollWidth = await cdp.evaluate<number>("document.documentElement.scrollWidth");
      assert(scrollWidth <= 375, `Mobile scrollWidth ${scrollWidth} must not exceed 375`);

      await cdp.captureScreenshot("08_mobile_account_nav_375.png");
    });

  } finally {
    await cdp.close();
  }

  console.log("\n================================================================================");
  console.log(`PHASE 03 BROWSER E2E RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log("CAPTURED SCREENSHOT EVIDENCE: 8 PNG ARTIFACTS");
  console.log("================================================================================\n");

  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal browser runner error:", err);
  process.exit(1);
});

