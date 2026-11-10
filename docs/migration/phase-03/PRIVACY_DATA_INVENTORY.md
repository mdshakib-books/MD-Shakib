# Personal Data Inventory & Privacy Impact Assessment
**Project:** MD Shakib Islamic Books  
**Document Code:** `PRIVACY_DATA_INVENTORY.md`  
**Date:** 2026-11-10  
**Statutory Alignment:** Digital Personal Data Protection Act, 2023 (DPDPA) & IT (SPDI) Rules, 2011  

---

## 1. Data Inventory & Mapping Table

| Data Category | Specific Data Elements | Collection Point / Trigger | Database Table / Storage | Purpose of Processing | Third Parties / Processors | Retention Schedule |
|---|---|---|---|---|---|---|
| **Identity & Authentication** | Email address, Full name, Phone number, Password hash, Supabase Auth user ID (`uuid`). | Account Registration, Google Auth, Login. | `auth.users`, `public.profiles`. | User identification, session authentication, account security. | **Supabase Auth** (Hosted Auth Provider), **Vercel** (Session cookies). | Retained for lifetime of account; anonymized upon validated customer erasure request. |
| **Delivery & Addresses** | Full name, Contact phone, House / Flat number, Area / Street, City, State, Pincode, Landmark, Address Type (Home/Work). | Address Book management, Checkout destination selection. | `public.addresses`, snapshot in `public.orders.address_snapshot`. | Order fulfillment, delivery routing, statutory tax invoice generation. | **Delhivery** (Logistics courier partner), **Supabase PostgreSQL**. | Maintained in profile until deleted by user; immutable snapshot retained in statutory invoices for 8 years (Companies Act & CGST statutory requirements). |
| **Financial & Transactional** | Order amount, Subtotal, Taxes, Delivery & platform fees, Payment method (COD / ONLINE), Razorpay Order ID, Razorpay Payment ID, Payment Signature, Refund ID. *(Note: Card numbers, CVV, expiry dates, and netbanking credentials are **NEVER** received or stored on our servers).* | Checkout, Payment Gateway callback, Settlement webhook. | `public.orders`, `public.payments`, `public.invoices`, `public.refunds`. | Order settlement, revenue reconciliation, payment fraud defense, issuing credit notes / refunds. | **Razorpay Software Pvt. Ltd.** (PCI-DSS Level 1 certified gateway), **Supabase PostgreSQL**. | Statutory minimum of 8 financial years under Section 128 of the Companies Act, 2013 and CGST Act, 2017. |
| **Logistics & Delivery Verification** | Waybill number (AWB), Courier status history, Event scan timestamps, Delivery OTP hash (`otp_hash` - salted SHA-256), Verification attempts, Doorstep verification timestamp. | Order shipment booking, Courier tracking webhooks, Doorstep OTP delivery. | `public.orders`, `public.delivery_otps`, `public.shipping_events`. | Real-time parcel tracking, non-repudiation of delivery, OTP verification, courier remittance reconciliation. | **Delhivery Limited** (Shipment carrier), **Supabase PostgreSQL**. | Maintained for 12 months following delivery for dispute and return window resolution. |
| **Communication & Support** | Customer name, Email, Subject, Inquiry message, Support ticket conversation history, Email dispatch status. | Contact form, Support ticket creation, Transactional emails. | `public.contact_submissions`, `public.support_tickets`, `public.email_logs`. | Resolving customer queries, sending order confirmations, delivery tracking notifications, and low-stock alerts. | **Resend Inc.** (Transactional email provider), **Supabase PostgreSQL**. | Support tickets maintained for 3 years; email dispatch logs retained for 90 days. |
| **Catalog & User Content** | Book ratings (1-5 stars), Review text, Review timestamp, Customer wishlist items, Active shopping cart items. | Product reviews, Wishlist toggle, Cart additions. | `public.book_reviews`, `public.wishlists`, `public.cart_items`. | Displaying book feedback, customer shopping persistence, aggregated book ratings. | **Supabase PostgreSQL**, cached on **Vercel CDN**. | Reviews retained until removed by user or moderated by admin; abandoned carts cleared after 30 days. |
| **Technical & Telemetry** | IP address (anonymized for rate-limiting), User-Agent string, Correlation ID, Request timestamp, HTTP status codes. | API requests, Server actions, Edge middleware. | Server logs, `public.audit_logs`, rate-limit memory stores. | Preventing DDoS, brute-force defense, rate-limiting, operational debugging. | **Vercel** (Application host), **Supabase** (Audit log table). | Transient server logs retained 30 days; audit logs retained for 1 year. |

---

## 2. Third-Party Service Processors & Data Sharing

| Service Provider | Role & Functionality | Data Shared | Transfer Mechanism | Privacy & Security Controls |
|---|---|---|---|---|
| **Supabase Inc.** | Cloud PostgreSQL database, Row Level Security, Auth session manager. | Account data, orders, addresses, invoices, audit trails. | Encrypted in transit (TLS 1.3) and at rest (AES-256). | Strict Row Level Security (RLS), Service-role isolation, daily backups. |
| **Razorpay Software Pvt. Ltd.** | Payment Gateway for UPI, Credit/Debit Cards, NetBanking. | Amount, Currency, Customer Email, Customer Phone, Order Reference. | HTTPS client-side checkout modal & signed server-to-server webhook callbacks. | PCI-DSS Level 1 compliant. Card data entered exclusively inside Razorpay secure sandbox iframe. |
| **Delhivery Limited** | Domestic express courier and surface logistics partner. | Recipient name, Delivery address, Pincode, Phone number, Order item titles, COD amount. | Authenticated REST API calls using secret token. | Carrier privacy agreement, masked contact numbers during courier delivery. |
| **Resend Inc.** | Transactional email delivery service. | Recipient email, Recipient name, Order summary, Delivery updates. | Server-to-server authenticated HTTPS REST API. | SPF, DKIM, and DMARC aligned delivery; zero marketing list leakage. |
| **Cloudinary Inc.** | Media asset storage and image CDN for book covers. | Book cover images only. *(Zero customer personal data shared).* | Signed HTTPS API uploads. | Read-only public asset delivery with content safety controls. |
| **Vercel Inc.** | Application edge routing, Next.js hosting, serverless functions. | Transient HTTP headers, client IP (for geo-routing & rate limiting). | Global Anycast Edge Network with TLS 1.3 termination. | SOC 2 Type II compliant hosting platform. |

---

## 3. Customer Rights & Redressal Workflows

In compliance with the Digital Personal Data Protection Act, 2023:

1. **Right of Access & Portability:**
   - Authenticated customers can view their personal profile, saved shipping addresses, order histories, invoices, and review contributions directly through their `/account` portal.
2. **Right to Correction / Rectification:**
   - Customers can update their profile information and addresses in real time at `/account/profile` and `/account/addresses`.
3. **Right to Erasure / Anonymization:**
   - The application provides an authenticated account anonymization endpoint (`/api/account/anonymize`).
   - *Technical Note:* In accordance with legal obligations under the Companies Act, 2013 and CGST Act, 2017, completed financial orders, generated tax invoices, and payment references **cannot be completely deleted**, but personal identifying fields (name, phone, personal email) are permanently anonymized or dissociated from customer authentication records upon verified account closure.
4. **Right of Grievance Redressal:**
   - Customers can submit data privacy complaints directly to `privacy@mdshakib.com` or via the statutory Grievance Officer channel. Acknowledgements are delivered within 48 hours.
