# PHASE 2 — DELIVERY OTP SYSTEM ARCHITECTURE
**MD Shakib Islamic Books Modernization Project**  
**Document Reference:** `docs/migration/phase-02/PHASE_2_DELIVERY_OTP_ARCHITECTURE.md`  
**Date:** 2026-11-09  
**Status:** Approved Technical Architecture  

---

## 1. OBJECTIVE & SECURITY PRINCIPLES

The Delivery OTP System provides a non-repudiable, tamper-resistant mechanism for validating the physical handover of customer consignments while maintaining a decoupled, independently auditable ledger for Cash On Delivery (COD) collections.

### Core Security Guarantees:
1. **Server-Side Generation Only:** OTPs are generated on the server using `node:crypto` CSPRNG (`crypto.randomInt(100000, 1000000)`).
2. **Zero Plaintext Storage:** Only the cryptographic HMAC-SHA256 hash of the OTP is persisted in the PostgreSQL database. Plaintext OTPs are never stored, logged, or included in general API payloads.
3. **Role & Ownership Isolation:** The plaintext OTP is visible **only** to the authenticated customer who placed the order, and **only** when the shipment status is explicitly `Out for Delivery`.
4. **Rate Limiting & Brute-Force Defense:** A maximum of 5 verification attempts are permitted before the OTP is permanently invalidated. Regeneration immediately invalidates any prior active OTP.
5. **Decoupled Financial Events:**
   - **Delivery Verification** confirms physical receipt of goods.
   - **COD Collection** records cash received at doorstep.
   - **Courier Remittance** records funds transferred by Delhivery into merchant bank accounts.
   - Under no circumstances does OTP verification automatically mark an order as paid without recorded cash collection or courier remittance.

---

## 2. LIFECYCLE STATE MACHINE

```
       [Order becomes 'Out for Delivery']
                     │
                     ▼
         ┌───────────────────────┐
         │     GENERATE OTP      │ ── (HMAC-SHA256 stored in DB)
         └───────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    [Customer Views]     [Regeneration Requested]
   (Auth owner only)             │
         │             (Atomically invalidates prior OTP)
         ▼
  [Delivery Agent Submits OTP]
         │
         ├─── Hash Mismatch (attempts < 5) ──► Increment attempt count
         ├─── Hash Mismatch (attempts >= 5) ─► Status: 'invalidated'
         ├─── Time > expires_at (24h) ───────► Status: 'expired'
         │
         └─── Hash Match & Valid State ──────► Status: 'verified'
                                                    │
                                                    ▼
                                          [Order -> 'Delivered']
                                          [Audit record inserted]
```

---

## 3. DATABASE SCHEMA & ENTITY DEFINITIONS

### 3.1 `public.delivery_otps`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique OTP record identifier |
| `order_id` | `UUID` | `NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE` | Associated customer order |
| `otp_hash` | `TEXT` | `NOT NULL` | HMAC-SHA256 digest of 6-digit OTP |
| `status` | `TEXT` | `CHECK (status IN ('active', 'verified', 'expired', 'invalidated'))` | Current lifecycle state |
| `attempts` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (attempts >= 0)` | Failed verification count |
| `max_attempts` | `INTEGER` | `NOT NULL DEFAULT 5` | Maximum failed attempts threshold |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | Hard expiration boundary (24 hours default) |
| `verified_at` | `TIMESTAMPTZ` | `NULL` | Handover timestamp upon verification |
| `verified_by` | `UUID` | `REFERENCES public.profiles(id)` | Staff member or agent completing verification |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last modification timestamp |

*Index:* `CREATE UNIQUE INDEX idx_delivery_otps_active_order ON public.delivery_otps(order_id) WHERE status = 'active';`

### 3.2 `public.delivery_verifications` (Audit Trail)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Audit event identifier |
| `order_id` | `UUID` | `NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE` | Order reference |
| `delivery_otp_id` | `UUID` | `REFERENCES public.delivery_otps(id)` | OTP reference |
| `actor_id` | `UUID` | `NOT NULL REFERENCES public.profiles(id)` | User attempting verification |
| `actor_role` | `TEXT` | `NOT NULL` | Role of actor at time of verification |
| `outcome` | `TEXT` | `CHECK (outcome IN ('SUCCESS', 'FAILED_INVALID_OTP', 'FAILED_EXPIRED', 'FAILED_MAX_ATTEMPTS', 'FAILED_WRONG_STATE', 'FAILED_UNAUTHORIZED'))` | Result |
| `failure_reason` | `TEXT` | `NULL` | Detailed error category |
| `shipment_awb` | `TEXT` | `NULL` | AWB of package |
| `metadata` | `JSONB` | `DEFAULT '{}'::jsonb` | Additional diagnostic context |
| `attempted_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Exact timestamp |

### 3.3 `public.cod_collections`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Collection identifier |
| `order_id` | `UUID` | `NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE` | Associated COD order |
| `expected_amount` | `NUMERIC(10,2)` | `CHECK (expected_amount >= 0)` | Expected order total |
| `collected_amount` | `NUMERIC(10,2)` | `CHECK (collected_amount >= 0)` | Actual physical cash received |
| `collector_id` | `UUID` | `NOT NULL REFERENCES public.profiles(id)` | Agent / staff receiving cash |
| `collection_status` | `TEXT` | `CHECK (collection_status IN ('collected', 'shortfall', 'excess', 'refused'))` | Balance status |
| `collection_reference` | `TEXT` | `NULL` | Physical receipt or pouch number |
| `collected_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Date and time cash was collected |
| `notes` | `TEXT` | `NULL` | Staff notes |

---

## 4. SERVER-AUTHORITATIVE VERIFICATION ALGORITHM (`verify_delivery_otp_atomic`)

The database RPC executes with `SECURITY DEFINER` and transactional row locking (`FOR UPDATE`):
1. **Lock & Inspect Order:** Validates order exists and `order_status` is `Out for Delivery`. If not, logs failure and returns `FAILED_WRONG_STATE`.
2. **Lock & Inspect Active OTP:** Finds active record from `delivery_otps` where `order_id = p_order_id AND status = 'active'`. If absent, returns `NO_ACTIVE_OTP`.
3. **Verify Expiration:** If `NOW() > expires_at`, updates OTP status to `expired`, logs failure, returns `FAILED_EXPIRED`.
4. **Verify Attempt Boundary:** If `attempts >= max_attempts`, updates OTP status to `invalidated`, logs failure, returns `FAILED_MAX_ATTEMPTS`.
5. **Verify Hash Match:** Computes HMAC-SHA256 of candidate OTP. If mismatch:
   - Increments `attempts = attempts + 1`.
   - If `attempts + 1 >= max_attempts`, marks `status = 'invalidated'`.
   - Logs audit failure.
   - Returns `FAILED_INVALID_OTP` with remaining attempts count.
6. **Execute Successful Handover:**
   - Sets OTP `status = 'verified'`, `verified_at = NOW()`, `verified_by = p_actor_id`.
   - Sets order `order_status = 'Delivered'`, `delivered_at = NOW()`, `shipping_delivered_at = NOW()`.
   - If order is COD and payment status is not yet 'Paid', sets `cod_settlement_status = 'pending'`.
   - Records audit event `outcome = 'SUCCESS'`.
   - Returns `{ success: true, order_id, delivered_at }`.
