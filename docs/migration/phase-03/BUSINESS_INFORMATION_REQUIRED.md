# Mandatory Business Information & Legal Disclosure Requirements
**Project:** MD Shakib Islamic Books  
**Document Code:** `BUSINESS_INFORMATION_REQUIRED.md`  
**Date:** 2026-11-10  
**Status:** MANDATORY HUMAN INPUT GATE  

---

## 1. Overview & Regulatory Purpose

Under the **Consumer Protection (E-Commerce) Rules, 2020** (notified under the Consumer Protection Act, 2019) and the **Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021**, all e-commerce entities operating in India are legally mandated to publish verified entity details, geographical office locations, customer support contacts, and a functional grievance redressal mechanism.

**Critical Guardrail:** Under no circumstances shall technical engineers fabricate legal entity identities, GSTIN numbers, company registration numbers, physical addresses, or Grievance Officer names. Any missing item is formally categorized below as an explicit **Blocker for Live Production Publication**.

---

## 2. Business Information Audit Matrix

| Item # | Information Field | Why It Is Needed | Where Displayed | Legal Requirement / Condition | Current Status | Verification State | Blocks Live Publication? |
|---|---|---|---|---|---|---|---|
| **BI-01** | **Registered Legal Entity Name** | Mandated under Rule 4(1)(a) of E-Commerce Rules, 2020 to identify the legal contracting party. | Website Footer, Contact Page, Legal Notices, Terms, Invoices. | Mandatory for all e-commerce entities in India. | **Pending Business Owner Input** (Currently displays trade name "MD Shakib") | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-02** | **Registered Business Address** | Mandated under Rule 4(1)(a) of E-Commerce Rules, 2020; essential for service of legal notices. | Website Footer, Contact Page, Legal Notices, Statutory Invoices. | Mandatory. A physical geographical address is required; P.O. Box alone is prohibited. | **Pending Business Owner Input** | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-03** | **Official Business Contact Email** | Customer support and pre-litigation correspondence channel. | Header, Footer, Contact Page, Terms, Order Confirmation Emails. | Mandatory. | Configured as `support@mdshakib.com` in code; requires business domain verification. | Provisionally Configured | **CONDITIONAL** (Requires live mailbox verification) |
| **BI-04** | **Official Business Contact Phone Number** | Mandated customer service contact number under Rule 4(1)(b) of E-Commerce Rules, 2020. | Header, Footer, Contact Page, Invoices. | Mandatory for consumer order inquiries and grievance escalations. | **BLOCKED** (Placeholder WhatsApp `919876543210` removed from customer UI to prevent misdirection) | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-05** | **Corporate Identification Number (CIN)** | Confirms corporate registration with the Ministry of Corporate Affairs (MCA). | About Page, Contact Page, Statutory Footer. | Mandatory if incorporated as a Private Limited, One Person Company, or Public Limited company. N/A for Sole Proprietorship or Partnership. | **Pending Business Entity Classification** | Unverified | **CONDITIONAL** (Mandatory if corporate entity) |
| **BI-06** | **Authoritative Seller GSTIN** | Mandated under Central Goods and Services Tax Act, 2017 for tax invoicing. | Tax Invoices, Credit Notes, Invoice API endpoint, Legal Disclosures. | Mandatory for intra/interstate e-commerce sellers exceeding threshold or selling through e-commerce operator. | **Pending Business Owner Input** (Code strictly fails closed in production via `invoices.ts`) | Staging mock used in dev; production value missing | **YES — BLOCKS INVOICING IN PROD** |
| **BI-07** | **Grievance Officer Name** | Rule 4(5) of E-Commerce Rules, 2020 mandates appointment of a Grievance Officer. | Contact Page, Grievance Policy, Terms & Conditions, Footer. | Mandatory. Must be a designated individual resident in India. | **Pending Business Owner Designation** | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-08** | **Grievance Officer Designation** | Confirms authority and corporate role of the designated officer. | Contact Page, Grievance Redressal Section. | Mandatory alongside officer name. | **Pending Business Owner Designation** | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-09** | **Grievance Officer Contact Details (Email & Phone)** | Direct escalation channel for consumer grievances. | Grievance Policy, Contact Page, Terms. | Mandatory. Must provide dedicated grievance email and telephone number. | Provisionally specified as `grievance@mdshakib.com`; pending mailbox setup and designated phone. | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-10** | **Grievance Turnaround & Redressal Mechanism** | Law requires ticket acknowledgement within 48 hours and redressing complaint within 1 month. | Contact Page, Grievance Policy, Customer Support FAQ. | Mandatory statutory timeline under Rule 4(5). | Implemented workflow (ticket tracking); SLA wording ready for business signoff. | Technically Implemented | **CONDITIONAL** (Requires business owner agreement to SLA) |
| **BI-11** | **Authoritative Shipping Terms & Express Limitations** | Governs carrier transit times, serviceable pincodes, and delayed parcel handling. | Shipping Policy Page, Checkout Consent, Order Confirmations. | Mandatory to prevent unfair trade practices under CPA 2019. | Aligned with Delhivery standard surface/air SLAs (3–7 business days). | Technically Aligned | **CONDITIONAL** (Requires business owner signoff) |
| **BI-12** | **Cancellation Cutoff Boundaries** | Informs consumers whether order can be cancelled before dispatch or after booking. | Cancellation Policy Page, Checkout Consent, Order Detail UI. | Mandatory under consumer protection transparency standards. | Strictly implemented: cancellation allowed only prior to courier dispatch (`Shipped`). | Technically Enforced | **CONDITIONAL** (Requires business owner signoff) |
| **BI-13** | **Return & Refund Window & Conditions** | Defines 7-day window, undamaged book condition, reverse pickup, and gateway refund timeline. | Return and Refund Policy Page, Checkout Consent, Customer Account. | Mandatory statutory disclosure. | Enforced in code: 7-day window, zero replacement dead-end, gateway refund in paise. | Technically Enforced | **CONDITIONAL** (Requires business owner signoff) |
| **BI-14** | **Applicable Business Jurisdiction** | Governs forum selection and courts of competence for disputes. | Terms & Conditions, Dispute Resolution Clause. | Standard commercial contractual requirement. | Proposed: Competent courts in Delhi, India (subject to seller domicile). | Unverified | **YES — BLOCKS LAUNCH** |
| **BI-15** | **Policy Approver / Authorizing Signatory** | Corporate governance audit trail verifying policies have been reviewed by counsel/owner. | Internal Compliance Record, Version History. | Essential for legal defensibility. | Pending Business Owner Signature | Unverified | **YES — BLOCKS LAUNCH** |

---

## 3. Safe Fallback & Fail-Closed Implementation Strategy

To ensure code development and local/staging verification can proceed without fabricating data:

1. **Centralized Configuration:** All business metadata is encapsulated in `apps/web/lib/config/business.ts`.
2. **Environment Variable Injection:** Placeholders are strictly prohibited. In production mode (`NODE_ENV === "production"`), the application will read from validated environment variables (`BUSINESS_LEGAL_NAME`, `BUSINESS_REGISTERED_ADDRESS`, `BUSINESS_GSTIN`, `BUSINESS_PHONE`, `GRIEVANCE_OFFICER_NAME`, `GRIEVANCE_OFFICER_EMAIL`, `GRIEVANCE_OFFICER_PHONE`).
3. **Graceful Transparency in UI:** On public disclosure sections, if an item is not yet configured, the UI clearly displays:
   > *"Details available upon request or pending statutory notification. Please contact support@mdshakib.com for immediate assistance."*
   Under no circumstances will a fictional CIN, fake GSTIN, or random phone number appear in production.
4. **Legal Disclaimer:** The policy templates provided in this codebase are technical draft implementations. The business owner must submit these documents to a qualified Indian legal advocate and Chartered Accountant for formal review prior to commercial launch.
