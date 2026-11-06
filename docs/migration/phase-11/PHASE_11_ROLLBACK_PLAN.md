# Phase 11: Final Release & Production Readiness — Production Rollback Plan
## MD Shakib Islamic Books Modernization & Migration

**Project:** MD Shakib Islamic Books  
**Phase:** 11 — Final Release & Production Readiness  
**Target Environment:** Vercel Production Infrastructure & Supabase Managed PostgreSQL  
**Audit Date:** November 6, 2026  
**Auditor:** DevOps Engineer & Release QA Lead  
**Verdict:** **COMPREHENSIVE MULTI-TIER ROLLBACK STRATEGY ESTABLISHED**  

---

## 1. Executive Summary & Principles

The Production Rollback Plan establishes explicit, actionable procedures to safely reverse application deployments, mitigate database migration regressions, and isolate external partner failures (payment gateway, shipping provider, email delivery) without compromising customer data integrity or causing revenue loss.

> **CRITICAL ARCHITECTURAL WARNING:**  
> A database migration is **NOT** automatically reversed by reverting application code. Reverting frontend code while leaving altered database state can cause runtime schema mismatches. Conversely, restoring a pre-release database snapshot after real customer orders have been placed causes catastrophic data loss.  
> **This plan strictly governs forward-fix vs rollback decisions.**

---

## 2. Rollback Trigger Conditions

A rollback or contingency switch must be initiated if any of the following critical trigger thresholds are breached within 2 hours post-deployment:

| Severity | Incident Trigger Condition | Measurement Source | Required Action |
| :--- | :--- | :--- | :--- |
| **P0 - Fatal** | Customer checkout failure: > 2% order placement failures | Vercel Edge Logs / Sentry | **Immediate Application Rollback** |
| **P0 - Fatal** | Database transaction deadlock or stock corruption | PostgreSQL Error Logs | **Maintenance Mode & Forward Fix** |
| **P0 - Fatal** | Security breach or credential exposure | Audit Logger / Edge Logs | **Immediate Credential Invalidation** |
| **P1 - Major** | Payment gateway capture failure: > 5% Razorpay errors | Razorpay Dashboard / Webhook | **Switch to COD-Only Fallback** |
| **P1 - Major** | Core Web Vitals severe degradation: LCP > 4.5s or CLS > 0.25 | Lighthouse / Real User Monitoring | **Application Deployment Rollback** |
| **P2 - Moderate**| Shipping serviceability failure: Delhivery API timeout | Delhivery Route Logs | **Fallback to Flat Delivery Pricing** |

---

## 3. Rollback Authority & Decision Matrix

- **Incident Commander:** Senior Release Engineer
- **Executive Decision Maker:** Technical Project Manager & Product Owner
- **Primary Database Custodian:** Database Administrator / Lead DevOps

```
Is the issue isolated to frontend JavaScript / CSS / routing?
  ├─► YES: Execute Instant Vercel Deployment Rollback (Duration: < 2 min, Zero data risk).
  └─► NO: Does the issue involve Database Schema or Data Mutation?
        ├─► Have new real customer orders been placed since release?
        │     ├─► YES: DO NOT RESTORE SNAPSHOT. Apply rapid Forward-Fix SQL Patch.
        │     └─► NO: Declare Maintenance Window; restore pre-migration database snapshot.
        └─► Is the issue an external third-party outage (Razorpay/Delhivery)?
              └─► Toggle feature flag / fallback mode (COD-only or manual fulfillment).
```

---

## 4. Multi-Tier Rollback Procedures

### 4.1 Tier 1: Application Deployment Rollback (Vercel)
Vercel maintains immutable build artifacts for every Git commit and deployment. Reverting traffic takes less than 30 seconds.

**Execution Steps:**
1. Open Vercel Project Dashboard &rarr; `md-shakib-books` &rarr; Deployments.
2. Locate the previous verified stable production deployment (Commit `015e7ad` or previous approved release SHA).
3. Click the context menu (`...`) next to the deployment &rarr; Select **Instant Rollback (Promote to Production)**.
4. Verify edge routing switch:
   ```bash
   curl -I https://mdshakibbooks.com
   # Confirm deployment header references the target rollback deployment ID
   ```
5. Confirm public storefront routes load with HTTP 200.

### 4.2 Tier 2: Database Migration Strategy (Forward-Fix vs Rollback)

#### Scenario A: Forward-Fix (Preferred Standard)
Because migrations 001 through 012 were authored with non-destructive, additive semantics (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), older application code remains 100% compatible with the migrated database schema.
1. Formulate a targeted remediation script (e.g., `fix_index_concurrency.sql`).
2. Test on staging project.
3. Apply to production via Supabase CLI:
   ```bash
   supabase db remote execute -f fix_targeted_issue.sql
   ```

#### Scenario B: Destructive Rollback (Zero New Orders Only)
If and ONLY IF zero production customer transactions have taken place, the pre-migration snapshot may be restored:
1. Route production traffic to maintenance page via Vercel Edge Config.
2. Terminate all active database connections:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'postgres' AND pid <> pg_backend_pid();
   ```
3. Restore pre-migration backup via `psql` or Supabase PITR console.
4. Verify table row counts match pre-release baseline.
5. Disable maintenance page.

### 4.3 Tier 3: Payment Gateway Fallback (Razorpay)
If Razorpay live API credentials or webhook signatures fail in production:
1. **COD-Only Mode:** In Vercel Environment Variables, temporarily disable online payments by setting `FEATURE_FLAG_COD_ONLY="true"` (or through admin settings).
2. The checkout UI seamlessly hides the Online Payment radio toggle and routes all orders to Cash on Delivery.
3. Customer purchasing continues without disruption while Razorpay credentials or bank webhooks are investigated.

### 4.4 Tier 4: Shipping Logistics Fallback (Delhivery)
If the Delhivery pincode serviceability or consignment API experiences a carrier outage:
1. The application's shipping route handler (`apps/web/app/api/shipping/serviceability/route.ts`) automatically falls back to standard Indian 6-digit regex validation and applies the default delivery fee (₹35, free above threshold).
2. Order placement proceeds uninterrupted.
3. Consignment bookings are flagged in the administrative panel as `Pending Carrier Sync` for bulk dispatch once carrier API recovers.

---

## 5. Post-Rollback Verification Checklist

Following any rollback or fallback action, the release team must execute this verification battery:

- [ ] Core storefront homepage loads with HTTP 200.
- [ ] Catalog search and book details load without JavaScript console errors.
- [ ] Customer authentication (login/register) succeeds.
- [ ] Cart item addition and total fee calculations remain exact.
- [ ] Checkout page loads with delivery address selector and active payment modes.
- [ ] Test order placement completes successfully.
- [ ] Admin dashboard and order management views operate normally.
- [ ] Error logging in Sentry / Vercel returns to baseline (< 0.1% error rate).
- [ ] Incident post-mortem ticket opened with timeline, root cause analysis (RCA), and remediation items.

---

## 6. Rollback Readiness Verdict

# **APPROVED & ACTIONABLE**

The multi-tier rollback procedures provide fail-safe operational safeguards across application code, database schema, payment gateways, and carrier logistics.
