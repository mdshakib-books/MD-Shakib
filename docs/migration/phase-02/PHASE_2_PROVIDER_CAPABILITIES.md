# PHASE 2 — EXTERNAL PROVIDER CAPABILITIES & INTEGRATION BOUNDARIES
**MD Shakib Islamic Books Modernization Project**  
**Document Reference:** `docs/migration/phase-02/PHASE_2_PROVIDER_CAPABILITIES.md`  
**Date:** 2026-11-09  
**Status:** Approved Architecture Investigation  

---

## 1. DELHIVERY LOGISTICS & DELIVERY OTP ARCHITECTURE INVESTIGATION

### 1.1 Context & Regulatory Framework
Under the Phase 2 specification (Requirements 2.1 through 2.9), a delivery verification and OTP system is mandatory to guarantee that consignments are delivered solely to the authorized customer, that delivery attempts are tamper-proof, and that Cash On Delivery (COD) collection remains strictly auditable and decoupled from delivery confirmation.

### 1.2 Inspection of Delhivery Account & API Capabilities
A systematic technical investigation was conducted on the Delhivery B2C Express logistics platform:

1. **Consignment Booking API:**
   - **Endpoint:** `POST https://track.delhivery.com/api/cmu/create.json`
   - **Payload format:** URL-encoded `format=json&data={ shipments: [...] }`
   - **Capability:** Creates forward consignments, reserves Waybill (AWB), assigns routing code, and registers COD collection instructions (`cod_amount`).

2. **Reverse Logistics / Return Pickup API:**
   - **Endpoint:** `POST https://track.delhivery.com/api/cmu/create.json` (with return pickup payload) or `POST https://track.delhivery.com/fm/request/new/`
   - **Capability:** Generates reverse pickup manifest, returns reverse AWB, schedules courier agent dispatch to customer doorstep.

3. **Tracking & Push Webhooks:**
   - **Endpoint (Outbound Push):** Merchant `/api/webhooks/delhivery`
   - **Status Codes:** `MANIFESTED`, `IT` (In Transit), `UD` (Out for Delivery), `DL` (Delivered), `RT` (RTO / Returned).
   - **Authentication:** Token / Header based (`x-delhivery-secret` / `Authorization: Token <token>`).

4. **Delhivery OTP Capabilities vs. Merchant-Generated OTP:**
   - **Delhivery-Generated Delivery OTP:**
     - In Delhivery's standard B2C Express network, when OTP-based delivery is provisioned as an enterprise Value Added Service (VAS), **Delhivery's own logistics engine generates and sends an SMS OTP directly to the consignee's phone** when the rider marks the shipment "Out for Delivery" or reaches the destination. The rider enters this OTP into their proprietary Delhivery Delivery Agent App.
     - **Limitation:** Delhivery does **NOT** expose a public REST API for standard e-commerce merchant accounts to supply an externally generated OTP string for Delhivery's rider app to validate. Furthermore, Delhivery's rider app cannot query an arbitrary merchant REST API in real time.
   - **Merchant/Application-Generated Delivery OTP:**
     - Generated securely server-side by MD Shakib Islamic Books platform (`delivery_otps` table).
     - Associated with `order_id` with cryptographically random entropy (6 digits or alphanumeric token).
     - Stored as HMAC-SHA256 with server-only secret `DELIVERY_OTP_HMAC_SECRET`.
     - Revealed to the authenticated order owner in the customer order tracking interface **only when the order reaches 'Out for Delivery'** status.
     - Verified through MD Shakib staff/delivery interface (`/admin/delivery-verification` and `/api/admin/delivery/verify-otp`) or store-operated delivery fleet.

### 1.3 Strict Architectural Distinction & Adapter Boundary
To prevent identity spoofing or false claims of courier integration:
1. **Application-Owned Delivery OTP (`delivery_otps`):**
   - Authoritative for the MD Shakib platform.
   - Independent of external courier vendor constraints.
   - Enables in-house delivery verification, warehouse counter pickups, and store delivery staff.
2. **Courier-Delivered Scans (`delhivery/service.ts`):**
   - Inbound Delhivery webhooks (`UD`, `DL`) update shipment tracking milestones.
   - **Crucial Rule:** Inbound Delhivery `DL` (Delivered) webhook is a courier notification; if an application-owned delivery OTP was issued for in-house delivery, delivery completion requires server-authoritative OTP verification.
   - **COD Separation:** Courier remittance and doorstep cash collection remain separate financial ledgers.

---

## 2. RAZORPAY INTEGRATION & REFUND CAPABILITIES (2.19, 2.21)

### 2.1 Refund API Capabilities
- **Endpoint:** `POST https://api.razorpay.com/v1/payments/{payment_id}/refund`
- **Authentication:** Basic Auth (`RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET`)
- **Capabilities Supported:**
  - Full refund: Omit `amount` or pass full captured amount.
  - Partial refund: Pass integer minor units (`amount: Math.round(refundAmount * 100)`).
  - Notes & Audit Metadata: `notes: { order_id, return_id, reason, authorized_by }`.
- **Idempotency:** Custom receipt reference or deterministic request identifier prevents duplicate gateway debits.
- **Webhook Reconciliation:**
  - Webhook event: `refund.processed` and `refund.failed`.
  - Signature verification: Raw request body HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`.
  - Database reconciliation: Synchronizes local `refund_records` status with gateway `refund.id`.

---

## 3. RESEND TRANSACTIONAL EMAIL CAPABILITIES (2.10, 2.14, 2.24)

- **Client:** `@resend/resend` SDK.
- **Capabilities:**
  - Transactional dispatch with custom HTML and plain-text fallback.
  - Automated tracking in `email_logs` table.
  - Rate limiting and retry handling.
- **Supported Notification Types in Phase 2:**
  - Order Invoice & Receipt email with PDF/HTML link.
  - Return Request confirmation & Return Status updates.
  - Support Ticket acknowledgment and staff response notifications.

---

## 4. CLOUDINARY MEDIA ASSET STORAGE (2.15, 2.23, 2.24)

- **Capabilities:**
  - Secure signed upload parameters (`/api/admin/media/sign`).
  - Binary magic-byte validation (`detectImageSignature` for JPEG, PNG, WebP).
  - Used in Phase 2 for:
    - Customer return evidence images (`return_requests.evidence_urls`).
    - Customer review photos (`reviews.images`).
    - Support ticket attachments (`ticket_messages.attachments`).

---

## 5. ENVIRONMENT ISOLATION & TEST MOCKS

| Provider | Production Config | Local / Sandbox Config | Verification Mode |
|---|---|---|---|
| **Delhivery** | Live Token & Track API | Mock serviceability, AWB generator, mock reverse pickup | Verified against deterministic adapter |
| **Razorpay** | Live Key & Secret | Razorpay Test Mode keys (`rzp_test_...`) & Mock Adapter | Verified against test signatures & mock RPC |
| **Resend** | Live API Key & Verified Domain | Mock / Local Mailpit (`http://127.0.0.1:54324`) | Verified via `email_logs` database persistence |
| **Cloudinary** | Live Cloudinary Account | Live Sandbox Cloudinary Account (`dpbnffgow`) | Verified via signed API upload and signature |
