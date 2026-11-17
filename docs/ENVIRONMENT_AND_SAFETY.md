# Environment Isolation, Credential Safety & Service Kill Switches

**Project:** MD Shakib Islamic Books (`apps/web`)  
**Scope:** Phase 01 — Environment & Development Safety  
**Status:** Implemented (Application Safeguards & Local Sanitization Complete; Remote Dev Supabase & Vercel Environment Provisioning Pending Owner Setup)

---

## 1. Environment Architecture

The application enforces explicit environment classification and validation across browser, SSR, middleware, and server startup boundaries via three isolated modules:

- **`apps/web/lib/env/shared.ts`** — Pure environment types (`AppEnvironment`, `ServiceExecutionMode`), URL/placeholder validators, strict boolean parsers, and structural Supabase key role inspectors (`anon` vs `service_role`, `sb_publishable_` vs `sb_secret_`). Safe for client and server bundles.
- **`apps/web/lib/env/public.ts`** — Browser-safe public configuration (`getPublicEnv()`, `assertValidPublicSupabaseEnv()`). Accesses only `NEXT_PUBLIC_*` variables via static property lookups and rejects any privileged `service_role` / `sb_secret_` key or `rzp_live_*` key exposed in non-production environments.
- **`apps/web/lib/env/server.ts`** — Strictly server-only validation and secret resolution (`validateServerEnv()`, `assertValidServerEnv()`, `assertValidServerEnvOnStartup()`, `resolveServerIntegrations()`, `getOtpHmacSecret()`, `isMockCatalogAllowed()`, `isMockOtpExposureAllowed()`). Rejects execution in browser runtimes (`typeof window !== "undefined"`).
- **`apps/web/instrumentation.ts`** — Next.js startup hook (`register()`) that runs `assertValidServerEnvOnStartup()` when the Node.js server starts (skipping only local non-Vercel build static collection).
- **`apps/web/lib/supabase/config.ts`** — Centralized Supabase configuration consumed by `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/admin.ts`, and `apps/web/middleware.ts`. Browser client (`apps/web/lib/supabase/client.ts`) consumes only `apps/web/lib/env/public.ts`.

### Environment Tiers

| Environment | `APP_ENV` / `NEXT_PUBLIC_APP_ENV` | `NODE_ENV` | `VERCEL_ENV` | Supabase Target | External Services | `ALLOW_MOCK_SERVICES` |
|---|---|---|---|---|---|---|
| **Local** | `local` / `development` | `development` | unset / `development` | Local Supabase (`http://127.0.0.1:54321`) or explicit isolated dev project | Disabled by default (`false`); sandbox only if explicitly enabled | Optional `true` (default `false`) |
| **Test** | `test` | `test` | unset | Local Supabase (`http://127.0.0.1:54321`) or offline mocks | Disabled by default (`false`) | Optional `true` (default `false`) |
| **Preview** | `preview` | `production` | `preview` | Dedicated development/staging Supabase project (`https://`) | Disabled or test/sandbox keys only | **Prohibited** (must be `false`/unset) |
| **Staging** | `staging` | `production` | `preview` or custom | Dedicated staging Supabase project (`https://`) | Sandbox/test credentials only | **Prohibited** (must be `false`/unset) |
| **Production** | `production` | `production` | `production` | Dedicated production Supabase project (`https://`) | Explicitly configured (`"true"` or `"false"`) with live keys | **Prohibited** (must fail startup) |

---

## 2. Local Development Setup

Live credentials previously present in `.env`, `apps/web/.env`, and `apps/web/.env.local` have been safely archived to gitignored, owner-only (`chmod 600`) backup files (`*.pre-phase01.bak`) and replaced with safe local development defaults.

### Setup Steps

1. Copy or review `apps/web/.env.example` and verify `apps/web/.env.local`:
   - `APP_ENV="local"`
   - `NEXT_PUBLIC_APP_ENV="local"`
   - `NEXT_PUBLIC_SITE_URL="http://localhost:3000"`
   - All service kill switches (`ENABLE_RAZORPAY`, `ENABLE_EMAILS`, `ENABLE_CLOUDINARY`, `ENABLE_DELHIVERY`, `ALLOW_MOCK_SERVICES`) default to `"false"`.
2. Start local Supabase (recommended) or configure a dedicated remote development Supabase project (see Section 3).
3. Start the Next.js development server from `apps/web`:
   ```bash
   cd apps/web
   npm run dev
   ```
4. Never commit `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.staging`, `.env.production`, or `*.pre-phase01.bak` files. Root `.gitignore` and `apps/web/.gitignore` exclude all of them.

---

## 3. Development Supabase Setup & Independent Migrations

### Separation Rules

- **Production Supabase** must ONLY be configured in the production deployment environment.
- **Local development** defaults to local Supabase (`http://127.0.0.1:54321`) defined in `supabase/config.toml` (`project_id = "MD-Shakib"`).
- If local development sets `NEXT_PUBLIC_SUPABASE_URL` to a remote `https://<ref>.supabase.co` URL, validation **fails fast** unless BOTH:
  - `SUPABASE_ALLOW_REMOTE_DEV="true"` is set, AND
  - `SUPABASE_DEV_PROJECT_REF="<dev-project-ref>"` matches the URL's project ref (and does NOT match `SUPABASE_PRODUCTION_PROJECT_REF` / `SUPABASE_PRODUCTION_URL`).
- **Preview and staging deployments** reject both `localhost` URLs and any match against `SUPABASE_PRODUCTION_PROJECT_REF` / `SUPABASE_PRODUCTION_URL`.

### Current Remote Dev Project Status

> **Setup Note:** No separate remote development Supabase project is linked in this repository yet (`supabase/.branches/_current_branch` is `main`, and no dedicated dev project ref is configured). Phase 01 intentionally does **not** create remote cloud projects or execute remote migrations automatically.

### Applying Migrations Independently in Local / Development

All 21 schema, RLS, RPC, and index migrations live under `supabase/migrations/` (from `20261028000001_core_schema.sql` through `20261110000002_phase03_checkout_consent.sql`), with seed data in `supabase/seed.sql`.

**Option A — Local Supabase Stack (Docker):**
```bash
# From repository root (requires Docker running)
supabase start
# Copy the local API URL, anon key, and service_role key printed by `supabase status` into apps/web/.env.local
supabase status
# Migrations in supabase/migrations/ and supabase/seed.sql are applied locally only
```

**Option B — Dedicated Remote Development Supabase Project:**
1. Create a separate Supabase project in the Supabase Dashboard (e.g., `md-shakib-dev`), distinct from production.
2. Point `apps/web/.env.local` to the dev project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ALLOW_REMOTE_DEV="true"`, `SUPABASE_DEV_PROJECT_REF="<dev-ref>"`, and `SUPABASE_PRODUCTION_PROJECT_REF="<prod-ref>"`).
3. Link and push migrations ONLY to the development project ref:
   ```bash
   supabase link --project-ref <dev-project-ref>
   supabase migration list
   supabase db push
   ```
   Verify the linked ref before every `supabase db push` or `supabase db reset`; **never** link local CLI sessions to the production project ref for dev testing.

---

## 4. Production and Preview Environment Separation

- **Preview Deployments (Vercel Preview):**
  - `VERCEL_ENV` is automatically `"preview"` and `NODE_ENV` is `"production"`.
  - Set `APP_ENV="preview"` and `NEXT_PUBLIC_APP_ENV="preview"` in Vercel **Preview** scope.
  - Configure a **separate** development/staging Supabase project (never production Supabase) and **test/sandbox** integration keys (`rzp_test_*`, `https://staging-express.delhivery.com`), or leave `ENABLE_*="false"`.
  - Set `SUPABASE_PRODUCTION_PROJECT_REF` in Preview so validation rejects accidental inheritance of the production Supabase URL.
- **Staging Deployments:**
  - Set `APP_ENV="staging"` and `NEXT_PUBLIC_APP_ENV="staging"` with staging Supabase and sandbox integration credentials only.
- **Production Deployments (Vercel Production):**
  - `VERCEL_ENV` is `"production"`. Set `APP_ENV="production"` and `NEXT_PUBLIC_APP_ENV="production"`.
  - Scoped **exclusively** in Vercel Production environment variables (never in Preview, Git, or local `.env*` files).
  - Never allow Preview deployments to share "All Environments" secret bindings for `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CLOUDINARY_API_SECRET`, `DELHIVERY_TOKEN`, `DELHIVERY_WEBHOOK_SECRET`, or `DELIVERY_OTP_HMAC_SECRET`.

---

## 5. Required Environment Variables & Matrix

### Standardized Variable Notes

- **Canonical names:** Use `NEXT_PUBLIC_RAZORPAY_KEY_ID` (deprecated legacy alias: `RAZORPAY_KEY_ID`), `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (deprecated legacy alias: `CLOUDINARY_CLOUD_NAME`), and `ADMIN_ALERT_EMAIL` (deprecated template alias: `ADMIN_EMAIL`).
- **Removed unused template variables:** `DELHIVERY_CLIENT_NAME` was previously listed in `apps/web/.env.example` but is unused by application code.
- **Added undocumented variables:** `DELIVERY_OTP_HMAC_SECRET`, `ADMIN_ALERT_EMAIL`, `EMAIL_SUPPORT`, `BUSINESS_LEGAL_NAME`, `BUSINESS_REGISTERED_ADDRESS`, `BUSINESS_PHONE`, `BUSINESS_GSTIN`, `BUSINESS_STATE_CODE`, `BUSINESS_CIN`, and `GRIEVANCE_OFFICER_*` are consumed by application code and are now documented in `.env.example` and `apps/web/.env.example`.

### Environment-Variable Matrix

| Variable | Local | Preview | Staging | Production | Required |
|---|---|---|---|---|---|
| `APP_ENV` | `local` | `preview` | `staging` | `production` | Recommended (Required in Vercel scopes) |
| `NEXT_PUBLIC_APP_ENV` | `local` | `preview` | `staging` | `production` | Recommended (Must match `APP_ENV`) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Preview HTTPS URL | Staging HTTPS URL | Canonical HTTPS domain | Yes (Prod: HTTPS non-localhost) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Optional fallback | Optional fallback | Optional fallback | No |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` or dev project | Dev/Staging `https://*.supabase.co` | Staging `https://*.supabase.co` | Production `https://*.supabase.co` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local/Dev anon key | Dev/Staging anon key | Staging anon key | Production anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Local/Dev service key (Server-Only) | Dev/Staging service key | Staging service key | Production service key | Yes (Server-Only) |
| `SUPABASE_PRODUCTION_PROJECT_REF` | Prod ref (blocklist guard) | Prod ref (blocklist guard) | Prod ref (blocklist guard) | Prod ref (allowlist guard) | Recommended |
| `SUPABASE_ALLOW_REMOTE_DEV` | `false` (`true` only for remote dev project) | `false` | `false` | `false` | Conditional |
| `SUPABASE_DEV_PROJECT_REF` | Dev ref when remote dev used | Optional | Optional | Never matches prod | Conditional |
| `ENABLE_RAZORPAY` | `false` (default) or `true` (test) | `false` or `true` (test) | `false` or `true` (test) | `true` or `false` (explicit) | Prod: Explicit |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | `""` or `rzp_test_*` | `""` or `rzp_test_*` | `rzp_test_*` | `rzp_live_*` | When `ENABLE_RAZORPAY=true` |
| `RAZORPAY_KEY_SECRET` | `""` or test secret | `""` or test secret | Test secret | Live secret | When `ENABLE_RAZORPAY=true` |
| `RAZORPAY_WEBHOOK_SECRET` | `""` or test secret | `""` or test secret | Test webhook secret | Live webhook secret | When `ENABLE_RAZORPAY=true` |
| `ENABLE_EMAILS` | `false` (default) | `false` or `true` (sandbox) | `false` or `true` (sandbox) | `true` or `false` (explicit) | Prod: Explicit |
| `RESEND_API_KEY` | `""` (never live key) | `""` or sandbox `re_*` | Sandbox `re_*` | Production `re_*` | When `ENABLE_EMAILS=true` |
| `EMAIL_FROM` | Dev sender string | Dev/Staging sender | Verified staging sender | Verified production sender | When `ENABLE_EMAILS=true` |
| `EMAIL_SUPPORT` | `support@mdshakib.com` | Support email | Support email | Support email | Recommended |
| `ADMIN_ALERT_EMAIL` | Dev inbox / placeholder | Staging inbox | Staging inbox | Ops alert email | Recommended |
| `ENABLE_CLOUDINARY` | `false` (default) | `false` or `true` (dev cloud) | `false` or `true` (staging cloud) | `true` or `false` (explicit) | Prod: Explicit |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | `""` or isolated dev cloud | Dev/Staging cloud | Staging cloud | Production cloud | When `ENABLE_CLOUDINARY=true` |
| `CLOUDINARY_API_KEY` | `""` or dev API key | Dev/Staging API key | Staging API key | Production API key | When `ENABLE_CLOUDINARY=true` |
| `CLOUDINARY_API_SECRET` | `""` or dev API secret | Dev/Staging API secret | Staging API secret | Production API secret | When `ENABLE_CLOUDINARY=true` |
| `ENABLE_DELHIVERY` | `false` (default) | `false` or `true` (staging URL) | `false` or `true` (staging URL) | `true` or `false` (explicit) | Prod: Explicit |
| `DELHIVERY_API_URL` | `https://staging-express.delhivery.com` | `https://staging-express.delhivery.com` | `https://staging-express.delhivery.com` | `https://track.delhivery.com` | When `ENABLE_DELHIVERY=true` |
| `DELHIVERY_TOKEN` | `""` or staging token | `""` or staging token | Staging token | Production API token | When `ENABLE_DELHIVERY=true` |
| `DELHIVERY_WEBHOOK_SECRET` | `""` or dev webhook secret | `""` or staging secret | Staging webhook secret | Production webhook secret | When `ENABLE_DELHIVERY=true` |
| `DELHIVERY_PICKUP_LOCATION` | Warehouse name | Warehouse name | Staging warehouse | Registered Delhivery warehouse | When `ENABLE_DELHIVERY=true` |
| `ALLOW_MOCK_SERVICES` | `false` (default; `true` only for explicit local/test mocks) | **`false` (Prohibited)** | **`false` (Prohibited)** | **`false` (Prohibited)** | Safe default `false` |
| `DELIVERY_OTP_HMAC_SECRET` | Local dev secret | Unique 16+ char secret | Unique 16+ char secret | Unique 32+ char CSPRNG secret | Yes (Prod/Staging/Preview) |
| `BUSINESS_LEGAL_NAME` | Dev legal entity | Staging entity | Staging entity | Registered legal entity | Yes in Production |
| `BUSINESS_REGISTERED_ADDRESS` | Dev address | Staging address | Staging address | Registered business address | Yes in Production |
| `BUSINESS_PHONE` | Dev phone | Staging phone | Staging phone | Official support phone | Yes in Production |
| `BUSINESS_GSTIN` | Optional | Optional | Optional | Valid 15-char live GSTIN | Yes in Production |
| `BUSINESS_STATE_CODE` | `07` | State GST code | State GST code | Seller state GST code | Recommended |
| `BUSINESS_CIN` | Optional | Optional | Optional | Optional (if applicable) | No |
| `GRIEVANCE_OFFICER_*` | Dev defaults | Staging details | Staging details | Statutory officer details | Yes in Production |

---

## 6. Service Kill Switches & Execution Modes

Every external integration resolves to one of four explicit server-side modes:

1. **`disabled`** — Default when `ENABLE_<SERVICE>` is `"false"` or unset (and mocks are not active). Performs **zero** outbound HTTP calls and returns predictable disabled errors (`503` on API routes, `{ success: false, disabled: true, mode: "disabled" }` on emails).
2. **`mock`** — Active **only** when `NODE_ENV` is `"development"` or `"test"`, `APP_ENV` is `local`/`development`/`test`, `ALLOW_MOCK_SERVICES="true"`, and the service's `ENABLE_<SERVICE>` flag is unset (not `"false"` and not `"true"`). Never executes network calls and tags logs/responses with `[MOCK]` / `isMock: true`.
3. **`sandbox`** — Active when `ENABLE_<SERVICE>="true"` in a non-production environment with valid test/sandbox credentials (`rzp_test_*`, `https://staging-express.delhivery.com`, isolated dev Cloudinary/Resend accounts). Real failures propagate as failures; never falls back to mock success.
4. **`live`** — Active when `ENABLE_<SERVICE>="true"` in `production` with validated live credentials (`rzp_live_*`, `https://track.delhivery.com`, non-mock Resend/Cloudinary keys).

### Kill Switch Variables

- `ENABLE_RAZORPAY` (`"true"` | `"false"`, dev default `false`)
- `ENABLE_EMAILS` (`"true"` | `"false"`, dev default `false`)
- `ENABLE_CLOUDINARY` (`"true"` | `"false"`, dev default `false`)
- `ENABLE_DELHIVERY` (`"true"` | `"false"`, dev default `false`)
- `ALLOW_MOCK_SERVICES` (`"true"` | `"false"`, default `false`; rejected in `preview`, `staging`, `production`, and any `NODE_ENV="production"` runtime)

---

## 7. Mock Service Restrictions

All mock, simulation, and fallback paths have been audited and restricted:

- **Razorpay (`lib/integrations/razorpay/service.ts`):** Removed silent `order_mock_*` catch-block fallback and unconditional `rzp_test_mock*` refund simulation. `order_mock_*` / `rfnd_mock_*` run only in `mode === "mock"`.
- **Resend (`lib/integrations/resend/service.ts`):** Eliminated the production bug where unconfigured Resend wrote `status: "sent"` into `email_logs` and returned `{ success: true, mode: "mock" }`. Disabled emails exit early without touching `email_logs`; unconfigured enabled emails fail honestly (`status: "failed"`).
- **Cloudinary (`lib/integrations/cloudinary/service.ts`):** Removed implicit `"mock_secret"` / `"mock_key"` / `"demo"` upload signing, mock `*.webp` URL generation, and `return true` deletion pass outside explicit `mode === "mock"`.
- **Delhivery & Returns (`lib/integrations/delhivery/service.ts`, `lib/commerce/returns.ts`):** Mocks require `ALLOW_MOCK_SERVICES="true"` in `development`/`test` (and `ENABLE_DELHIVERY` not `"false"`). Removed synthetic `REV-${Date.now()}` reverse pickup AWB fabrication from non-mock `scheduleReturnPickup()`.
- **Catalog, Cart & Sitemap (`lib/data/catalog.ts`, `lib/commerce/cart.ts`, `app/sitemap.ts`):** `MOCK_BOOKS` fallback is strictly gated behind `isMockCatalogAllowed()`. Database failures in production, preview, staging, or non-mock dev surface errors instead of silently serving mock book prices/stock.
- **Phone & Delivery OTP (`lib/auth/phone.ts`, `lib/delivery/otp.ts`):** Removed hardcoded fallback HMAC strings in production/preview/staging via `getOtpHmacSecret()`, and restricted `mockOtpForTesting` to `isMockOtpExposureAllowed()`.

---

## 8. Safe Testing Procedures

Never run database-backed tests against production or shared remote Supabase instances.

1. **Offline Phase 01 Safety Suite (no DB, no network):**
   ```bash
   cd apps/web
   npx tsx scripts/test-phase01-environment-safety.ts
   ```
2. **Offline Delhivery Safety Suite:**
   ```bash
   cd apps/web
   npx tsx scripts/test-delhivery-missing-credentials.ts
   ```
3. **Offline Unit, Security & Boundary Suites:**
   ```bash
   cd apps/web
   npx tsx scripts/test-phase09-unit-and-business-logic.ts
   npx tsx scripts/test-phase03a-security-and-lifecycle.ts
   npx tsx scripts/test-phase03a-eligibility-boundaries.ts
   npx tsx scripts/test-phase03-production-config.ts
   ```
4. **Typecheck, Lint, and Build:**
   ```bash
   cd apps/web
   npm run typecheck
   npm run lint
   npm run build
   ```
5. **Local Supabase Integration Tests:** Only run DB-backed test scripts (`test-integrations.ts`, etc.) after verifying `NEXT_PUBLIC_SUPABASE_URL` points to `http://127.0.0.1:54321` (local Docker Supabase) or an isolated disposable dev project with `ALLOW_MOCK_SERVICES="true"` as needed.

---

## 9. Deployment Configuration Checklist

- [ ] Separate Supabase projects provisioned for **Development/Staging** and **Production**.
- [ ] `APP_ENV` and `NEXT_PUBLIC_APP_ENV` explicitly configured per Vercel environment scope (`preview`, `staging`, `production`).
- [ ] `SUPABASE_PRODUCTION_PROJECT_REF` set in Preview/Staging so production Supabase is blocked by validation.
- [ ] `ALLOW_MOCK_SERVICES` unset or `"false"` in Preview, Staging, and Production.
- [ ] All four kill switches (`ENABLE_RAZORPAY`, `ENABLE_EMAILS`, `ENABLE_CLOUDINARY`, `ENABLE_DELHIVERY`) explicitly set (`"true"` or `"false"`) in Production.
- [ ] Production uses `rzp_live_*` keys, verified Resend domain + production key, production Cloudinary cloud, and `https://track.delhivery.com` (if Delhivery enabled).
- [ ] Unique `DELIVERY_OTP_HMAC_SECRET` (>= 32 bytes) generated for Staging and Production.
- [ ] Verified statutory `BUSINESS_GSTIN`, `BUSINESS_LEGAL_NAME`, `BUSINESS_REGISTERED_ADDRESS`, `BUSINESS_PHONE`, and `GRIEVANCE_OFFICER_*` configured in Production.
- [ ] `/api/health` verified post-deploy (`envValid: true`, expected `appEnv`, `mockServicesAllowed: false`, and expected `serviceModes`).

---

## 10. Manual Steps Required from the Project Owner

1. **Provision Separate Development Supabase Environment:**
   - Either start local Supabase (`supabase start`) and populate local keys from `supabase status` into `apps/web/.env.local`, **or** create a separate development Supabase project in the Supabase Dashboard and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ALLOW_REMOTE_DEV="true"`, and `SUPABASE_DEV_PROJECT_REF`.
   - Apply the 21 migrations under `supabase/migrations/` independently to that development database (do not test against production).
2. **Review Archived Pre-Phase-01 Credentials & Rotate if Needed:**
   - The previous `.env`, `apps/web/.env`, and `apps/web/.env.local` contents were preserved locally in gitignored `0600` backup files (`*.pre-phase01.bak`).
   - Because live Resend, Cloudinary, Delhivery, and remote Supabase keys were previously stored locally in plaintext `.env` files, consider rotating any production secrets that were ever shared across developer machines and moving production-only values exclusively into your deployment secret manager (Vercel Production).
   - Once production environment variables are securely stored in Vercel Production, delete the local `*.pre-phase01.bak` files.
3. **Configure Dedicated Non-Production Integration Accounts (Optional for Sandbox Testing):**
   - Generate Razorpay **Test Mode** (`rzp_test_*`) keys for `apps/web/.env.local` and Vercel Preview.
   - Create a separate dev/sandbox Cloudinary cloud if testing uploads locally.
   - Obtain Delhivery **Staging** credentials (`https://staging-express.delhivery.com`) if testing Delhivery APIs before production.
4. **Configure Vercel Environment Scopes & Statutory Business Disclosures:**
   - Set Production variables strictly under Vercel **Production** scope and Preview/Staging variables strictly under **Preview** scope.
   - Populate `BUSINESS_GSTIN`, `BUSINESS_LEGAL_NAME`, `BUSINESS_REGISTERED_ADDRESS`, `BUSINESS_PHONE`, `GRIEVANCE_OFFICER_*`, and a unique `DELIVERY_OTP_HMAC_SECRET` before going live.
