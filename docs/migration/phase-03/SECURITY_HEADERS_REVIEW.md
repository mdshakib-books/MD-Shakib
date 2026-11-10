# Security Headers Architecture & Evaluation
**Project:** MD Shakib Islamic Books  
**Document Code:** `SECURITY_HEADERS_REVIEW.md`  
**Date:** 2026-11-10  
**Scope:** `next.config.ts`, `middleware.ts`, API Route Handlers, Third-Party Integrations  

---

## 1. Security Header Directives & Configuration

| Security Header | Configured Value | Purpose & Threat Mitigation | Verification Route |
|---|---|---|---|
| **Content-Security-Policy (CSP)** | Directives specified below | Mitigates Cross-Site Scripting (XSS), data injection, and unauthorized frame embeds. | All HTML pages (`/*`) |
| **Strict-Transport-Security (HSTS)** | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS communication, preventing SSL stripping and protocol downgrade attacks. | Production HTTPS responses |
| **X-Content-Type-Options** | `nosniff` | Prevents MIME-type sniffing vulnerabilities by forcing browsers to adhere to declared Content-Type. | All routes (`/*`) |
| **X-Frame-Options** | `DENY` | Prevents Clickjacking attacks by strictly forbidding the application from being embedded in foreign iframes. | All routes (`/*`) |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | Protects privacy by sending the full URL only on same-origin requests, and only the origin over secure cross-origin requests. | All routes (`/*`) |
| **Permissions-Policy** | `camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")` | Disables access to sensitive hardware sensors and APIs, while explicitly granting payment permission to self and Razorpay. | All routes (`/*`) |
| **X-XSS-Protection** | `1; mode=block` | Legacy XSS filter activation for older browsers. | All routes (`/*`) |

---

## 2. Content-Security-Policy (CSP) Directives Breakdown

The CSP policy is custom-tailored to the application's actual dependencies:
- **Next.js 16.4.3 Turbopack Engine**
- **Razorpay Checkout SDK** (`https://checkout.razorpay.com`)
- **Supabase PostgreSQL & Realtime WebSockets** (`https://*.supabase.co`, `ws://`, `http://127.0.0.1:54321`)
- **Cloudinary Image CDN** (`https://res.cloudinary.com`)
- **Unsplash Media** (`https://images.unsplash.com`, `https://plus.unsplash.com`)

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://checkout.razorpay.com;
  font-src 'self' data:;
  connect-src 'self' https://*.supabase.co http://127.0.0.1:54321 http://localhost:54321 https://api.razorpay.com https://lumberjack.razorpay.com https://res.cloudinary.com;
  frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
```

---

## 3. Compatibility & Non-Breaking Verification

1. **Razorpay Modal Checkout:**
   - Razorpay dynamically loads `https://checkout.razorpay.com/v1/checkout.js` and creates an embedded payment iframe communicating with `https://api.razorpay.com` and `https://lumberjack.razorpay.com`.
   - Whitelisting `https://checkout.razorpay.com` in `script-src`, `frame-src`, and `img-src`, and `https://api.razorpay.com` in `connect-src` and `frame-src`, ensures seamless UPI, Card, and NetBanking payments without browser CSP policy blocks.
2. **Cloudinary Asset Uploads & CDN:**
   - Whitelisting `https://res.cloudinary.com` in `img-src` and `connect-src` guarantees that book cover images and admin signed image uploads operate reliably without blocking.
3. **Local Dev & Testing Sandbox:**
   - In non-production environments (`process.env.NODE_ENV !== "production"`), HSTS is omitted to allow smooth `http://localhost:3000` testing without forcing HTTPS redirects.
