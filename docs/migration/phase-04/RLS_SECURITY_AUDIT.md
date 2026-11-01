# Row Level Security (RLS) & Multi-Tenant Authorization Audit
**Project:** MD Shakib Islamic Books  
**Phase:** 04 — Backend & Database Integrity  
**Repository:** `MD-Shakib`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This report documents the security posture of the application's data layer across all 15 PostgreSQL tables. Row Level Security (RLS) is enabled on 100% of tables exposed via Supabase PostgREST.

Access boundaries are enforced across four distinct security principals:
1. `anon`: Unauthenticated public visitors.
2. `authenticated`: Logged-in customers.
3. `admin`: Authenticated users with verified `role = 'admin'`, `is_blocked = FALSE`, and `is_deleted = FALSE`.
4. `service_role`: Trusted backend server processes executing administrative routines.

---

## 2. Table-by-Table RLS Policy Audit

| Table | RLS Enabled | Policies Active | Anonymous Access | Authenticated Customer Access | Admin Access | Service Role |
|---|---|---|---|---|---|---|
| `public.profiles` | YES | 3 policies | NONE (0 rows) | Read/Update own profile only (`id = auth.uid()`) | Full Read/Update across profiles | Full Access |
| `public.addresses` | YES | 4 policies | NONE (0 rows) | Full CRUD restricted to own addresses (`user_id = auth.uid()`) | Full Access | Full Access |
| `public.books` | YES | 2 policies | SELECT only if `is_active = TRUE` | SELECT active books | Full CRUD across all catalog books | Full Access |
| `public.carts` | YES | 2 policies | NONE (0 rows) | Read/Write own cart only (`user_id = auth.uid()`) | Full Access | Full Access |
| `public.cart_items`| YES | 4 policies | NONE (0 rows) | Full CRUD restricted to own cart items via join | Full Access | Full Access |
| `public.orders` | YES | 2 policies | NONE (0 rows) | SELECT own orders only (`user_id = auth.uid()`). Mutations via RPC | Full Access | Full Access |
| `public.order_items`| YES | 2 policies | NONE (0 rows) | SELECT own items via join (`order.user_id = auth.uid()`) | Full Access | Full Access |
| `public.order_status_history`| YES | 2 policies | NONE (0 rows) | SELECT own order history via join | Full Access | Full Access |
| `public.payments` | YES | 2 policies | NONE (0 rows) | SELECT own payments only (`user_id = auth.uid()`) | Full Access | Full Access |
| `public.audit_logs`| YES | 2 policies | NONE (0 rows) | INSERT permitted for own actions (`user_id = auth.uid()`); SELECT restricted to Admins | Full Access | Full Access |
| `public.email_logs`| YES | 1 policy | NONE (0 rows) | NONE (Restricted strictly to Administrators) | Full Read | Full Access |
| `public.categories`| YES | 2 policies | SELECT if `is_active = TRUE` | SELECT if `is_active = TRUE` | Full CRUD | Full Access |
| `public.inventory_adjustments`| YES | 1 policy | NONE (0 rows) | NONE (Restricted strictly to Administrators) | Full Read | Full Access |
| `public.reviews` | YES | 3 policies | SELECT if `status = 'approved'` | SELECT approved + own; INSERT new review | Full CRUD & Moderation | Full Access |
| `public.discounts` | YES | 2 policies | NONE (0 rows) | SELECT active coupons | Full CRUD | Full Access |

---

## 3. Privilege Escalation Defense

### 3.1 Protection on `profiles.role`
Customers are strictly prevented from escalating their privilege to `admin`:
- **RLS Policy on `profiles` (UPDATE):**
  ```sql
  CREATE POLICY "profiles_update_self" ON public.profiles
      FOR UPDATE TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
  ```
  Even if an attacker submits `{ "role": "admin" }` in an update request, the `WITH CHECK` clause verifies that the updated role equals their existing role in the database.
- **Verification:** Verified by `test-phase04-backend-integrity.ts` (Pass 08) and `test-auth.mjs` (Pass 06). Attempted update fails with RLS policy violation.

### 3.2 Cross-Tenant Isolation
- **Cart Isolation:** Customer B cannot view or manipulate Customer A's cart items (`test-phase04-backend-integrity.ts`, Pass 07).
- **Address Isolation:** Customer B cannot read, update, or delete Customer A's saved addresses (`test-phase04-backend-integrity.ts`, Pass 06).
- **Order Isolation:** Customer B cannot view or cancel Customer A's orders (`test-phase04-backend-integrity.ts`, Pass 07, Pass 11).
- **Payment Isolation:** Customer B cannot query Customer A's payment transactions or refunds (`test-phase04-backend-integrity.ts`, Pass 06).

---

## 4. Stored Procedure Caller Identity & Search Path Security

PostgreSQL `SECURITY DEFINER` procedures execute with the privileges of the database owner. Without strict identity enforcement and search path isolation, these procedures present potential security risks.

### 4.1 Strict Caller Identity Pattern
Every stored procedure enforces the following pattern:
```sql
IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required: Anonymous callers cannot execute this procedure.';
    END IF;
    IF auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Security violation: Caller identity does not match specified user ID.';
    END IF;
END IF;
```

This ensures:
1. Anonymous callers (`auth.uid() = NULL`) are instantly blocked.
2. An authenticated user cannot impersonate another customer by passing their UUID in arguments.
3. Trusted backend processes (`service_role`) can still execute operational tasks.

### 4.2 Explicit Search Path Configuration
All 14 `SECURITY DEFINER` routines specify `SET search_path = public, pg_temp;`. This prevents search-path hijacking where malicious users create objects in untrusted schemas.

### 4.3 Function Execution Privilege (GRANTS)
| Stored Procedure | Anonymous (`anon`) | Authenticated Customer | Service Role |
|---|---|---|---|
| `create_order_atomic` | REVOKED | GRANTED | GRANTED |
| `cancel_order_atomic` | REVOKED | GRANTED | GRANTED |
| `request_replacement_atomic` | REVOKED | GRANTED | GRANTED |
| `merge_cart_atomic` | REVOKED | GRANTED | GRANTED |
| `submit_review_atomic` | REVOKED | GRANTED | GRANTED |
| `adjust_inventory_atomic` | REVOKED | GRANTED (Requires Admin role) | GRANTED |
| `moderate_review_atomic` | REVOKED | GRANTED (Requires Admin role) | GRANTED |
| `update_customer_status` | REVOKED | GRANTED (Requires Admin role) | GRANTED |
| `validate_discount_coupon` | GRANTED | GRANTED | GRANTED |
| `settle_payment_atomic` | REVOKED | REVOKED | GRANTED |
| `record_payment_failure_atomic` | REVOKED | REVOKED | GRANTED |
| `record_refund_atomic` | REVOKED | REVOKED | GRANTED |

Financial settlement procedures (`settle_payment_atomic`, `record_payment_failure_atomic`, `record_refund_atomic`) are revoked from all public and authenticated users and are strictly callable only by `service_role`.

---

## 5. Audit Conclusion
The Row Level Security model and stored procedure authorization guards have been verified via automated tests using real authenticated JWT contexts. Data isolation and privilege enforcement operate with zero defects.

