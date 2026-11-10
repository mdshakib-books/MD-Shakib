# Indian E-Commerce Regulatory Compliance Review
**Project:** MD Shakib Islamic Books  
**Document Code:** `INDIAN_ECOMMERCE_COMPLIANCE_REVIEW.md`  
**Date:** 2026-11-10  
**Regulatory Frameworks Evaluated:**
1. Consumer Protection Act, 2019 (Act No. 35 of 2019)
2. Consumer Protection (E-Commerce) Rules, 2020 (notified under CPA 2019)
3. Information Technology Act, 2000 & IT (Intermediary Guidelines) Rules, 2021
4. Digital Personal Data Protection Act, 2023 (DPDPA)
5. Legal Metrology (Packaged Commodities) Rules, 2011 (E-Commerce provisions)
6. Central Goods and Services Tax Act, 2017 & Statutory E-Way/Invoicing Rules

---

## 1. Compliance Audit & Enforcement Matrix

| Regulatory Provision | Statutory Requirement | Application Implementation | Compliance Status | Remediations / Necessary Actions |
|---|---|---|---|---|
| **Rule 4(1)(a) of E-Commerce Rules, 2020** | Mandatory display of legal entity name and principal geographic address. | Footer and Contact page currently show brand name "MD Shakib". | **CONDITIONAL / GAP** | Implemented central config in `business.ts`. Displays official name and address when configured; displays formal inquiry contact when pending. Must be provided by business owner. |
| **Rule 4(1)(b) of E-Commerce Rules, 2020** | Website contact details including customer care telephone and email. | Email `support@mdshakib.com` is configured. Dummy phone number was present. | **REMEDIATED IN CODE** | Removed fake WhatsApp number (`919876543210`). Replaced with configured phone support or official ticket link. Real phone number required from business owner. |
| **Rule 4(2) of E-Commerce Rules, 2020** | Full disclosure of return, refund, exchange, warranty, delivery, and payment terms before checkout. | Policies existed informally or fragmented across code. | **REMEDIATED IN CODE** | Created dedicated public pages: `/shipping-policy`, `/cancellation-policy`, and `/returns-policy`. Linked in footer and checkout consent box. |
| **Rule 4(3) of E-Commerce Rules, 2020** | Display total price in a single figure along with explicit itemized breakup (subtotal, delivery fee, platform fee, taxes). | `CheckoutClient.tsx` and server-side pricing compute subtotal, platform fee (₹19), delivery fee (₹49), coupon discount, and total payable in single figure. | **FULLY COMPLIANT** | Verified in `STG-CHK-01` and `STG-CHK-02`. Zero hidden charges. All items display Indian Rupee (`₹`) pricing. |
| **Rule 4(4) of E-Commerce Rules, 2020 & Legal Metrology Rules** | Clear details of goods including title, author, publisher, MRP, net quantity, and country of origin. | Book detail pages display title, author, description, price, publisher, language, page count, and stock status. | **COMPLIANT** | Catalog schema tracks publisher and author. Product pages specify "Country of Origin: India" and "Net Quantity: 1 Unit". |
| **Rule 4(5) of E-Commerce Rules, 2020** | Appointment of Grievance Officer resident in India; acknowledge complaint in 48 hours; redress in 1 month. | Ticket support exists in `/api/support/tickets`. Grievance Officer details lacked formal publication. | **REMEDIATED IN CODE** | Created statutory Grievance Redressal section with 48h acknowledgement and 30-day resolution SLA. Awaiting human officer designation from business owner. |
| **Rule 4(11) of E-Commerce Rules, 2020** | Prohibition of pre-ticked consent boxes or automatic purchase consent. | Previous checkout had passive text with no explicit consent checkbox. | **REMEDIATED IN CODE** | Implemented explicit, initially unchecked checkbox on checkout. Order placement is strictly prevented until customer manually opts in. Recorded server-side with timestamp and policy version. |
| **DPDPA 2023 Principles** | Notice & Consent, Purpose Specification, Data Minimization, and Customer Rights. | Privacy policy was rudimentary. | **REMEDIATED IN CODE** | Compiled complete data inventory in `PRIVACY_DATA_INVENTORY.md` and expanded `/privacy-policy` detailing collected fields, third-party processors, storage security, and customer rights. |
| **CGST Act 2017 & Statutory Invoicing** | Authoritative tax invoice generation with seller GSTIN, HSN codes, and CGST/SGST/IGST breakdown. | Implemented via `invoices.ts` and `generate_order_invoice_atomic`. Books exempt (0%), shipping taxable (18%). | **COMPLIANT** | Staging acceptance tests `STG-INV-01` through `STG-INV-07` pass. Fails closed in production if `BUSINESS_GSTIN` is absent or a placeholder. |

---

## 2. Special Regulatory Notes for Islamic Scholarly Bookstore

1. **Books GST Exemption:**
   - Under Notification No. 12/2017-Central Tax (Rate), printed books, journals, and periodicals (HSN 4901) attract **0% GST**.
   - Transportation/courier charges incurred for shipping attract **18% GST** (inclusive or itemized). The application correctly implements this distinction in `apps/web/lib/commerce/tax.ts`.
2. **Delivery OTP Verification:**
   - E-commerce consumer fraud mitigation: High-value or COD book consignments require customer OTP verification at doorstep. The application's CSPRNG delivery OTP architecture (`STG-OTP-01` to `STG-OTP-05`) safeguards delivery completion.
3. **Legal Disclaimer:**
   - Technical compliance mechanisms implemented herein do not constitute a legal opinion or formal certification. The business owner must review all published disclosures with legal counsel licensed in India prior to commercial activation.
