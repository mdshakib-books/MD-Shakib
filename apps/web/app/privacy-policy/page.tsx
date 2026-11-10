import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { BUSINESS_CONFIG } from "@/lib/config/business";

export const metadata: Metadata = {
  title: "Privacy Policy | MD Shakib Islamic Books",
  description: "Comprehensive privacy disclosures, data processing terms, and customer rights under DPDPA 2023 for MD Shakib Islamic Books.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />
      <main id="main-content" className="flex-grow">
        <PageContainer size="md">
          <div className="py-12 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)] uppercase mb-2">
              Privacy Policy &amp; Data Notice
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-mono">
              Last Updated: November 2026 | Aligned with Digital Personal Data Protection Act, 2023 (DPDPA)
            </p>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed pt-4 border-t border-dark-border">
              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  1. Introduction &amp; Data Fiduciary
                </h2>
                <p className="text-neutral-400">
                  {BUSINESS_CONFIG.brandName} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) acts as the Data Fiduciary under the Digital Personal Data Protection Act, 2023. We are committed to processing your digital personal data transparently, securely, and strictly for lawful purposes associated with our online bookstore.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  2. Personal Data We Collect
                </h2>
                <p className="text-neutral-400">
                  We collect only the minimum personal data necessary to provide authentic literature fulfillment:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><strong>Account Data:</strong> Name, email address, contact telephone number, and authentication password hash.</li>
                  <li><strong>Delivery &amp; Billing Data:</strong> Flat/house number, street address, city, state, postal pincode, and delivery landmark.</li>
                  <li><strong>Transaction Records:</strong> Order numbers, items purchased, totals, payment method (COD or Online), and payment gateway reference IDs.</li>
                  <li><strong>Verification Data:</strong> Cryptographic Delivery OTP hashes (stored as salted SHA-256 hashes; never stored in plaintext) for doorstep verification.</li>
                  <li><strong>Customer Inquiries:</strong> Communications submitted via our customer support desk or contact forms.</li>
                </ul>
                <div className="p-3.5 rounded-xl bg-dark-surface border border-dark-border mt-3 text-xs text-neutral-300">
                  <strong>Payment Card Security Notice:</strong> We do <em>not</em> collect, process, or store credit/debit card numbers, CVVs, or netbanking passwords on our servers. All digital payments are entered directly into our PCI-DSS Level 1 compliant gateway provider (Razorpay).
                </div>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  3. Lawful Purposes for Processing
                </h2>
                <p className="text-neutral-400">
                  Your personal data is processed strictly for:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li>Processing, packaging, and dispatching your book orders.</li>
                  <li>Generating statutory GST tax invoices and accounting documentation.</li>
                  <li>Sending automated transactional notices (order receipts, dispatch notifications, tracking updates).</li>
                  <li>Doorstep parcel verification and courier remittance reconciliation.</li>
                  <li>Addressing customer support questions and return/refund inquiries.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  4. Third-Party Data Processors
                </h2>
                <p className="text-neutral-400">
                  To operate our e-commerce platform, we share limited necessary data with vetted third-party service providers under contractual confidentiality:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><strong>Delhivery Logistics:</strong> Courier partner receiving delivery address and phone number for parcel transit.</li>
                  <li><strong>Razorpay Software Pvt. Ltd.:</strong> Payment gateway for processing UPI and card transactions.</li>
                  <li><strong>Supabase Inc.:</strong> Hosted cloud database with Row Level Security (RLS) and encrypted storage.</li>
                  <li><strong>Resend Inc.:</strong> Transactional email infrastructure for sending automated receipts.</li>
                  <li><strong>Cloudinary Inc.:</strong> CDN hosting book cover images (no personal customer data shared).</li>
                  <li><strong>Vercel Inc.:</strong> Application edge routing and secure serverless hosting.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  5. Data Retention &amp; Statutory Records
                </h2>
                <p className="text-neutral-400">
                  We retain personal data only for as long as necessary to fulfill the purposes for which it was collected:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><strong>Profile &amp; Account Data:</strong> Retained for the lifetime of your active account.</li>
                  <li><strong>Statutory Invoices &amp; Financial Ledgers:</strong> In compliance with Section 128 of the Companies Act, 2013 and the Central Goods and Services Tax Act, 2017, tax invoices and transaction records must be retained for a mandatory minimum of <strong>8 financial years</strong>.</li>
                  <li><strong>Delivery OTP Records:</strong> Expire within 24 hours; verification hashes retained up to 12 months for dispute resolution.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  6. Your Rights Under DPDPA 2023
                </h2>
                <p className="text-neutral-400">
                  As a Data Principal under Indian law, you are entitled to:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><strong>Right to Access:</strong> View all saved personal data, addresses, and transaction histories in your <Link href="/account" className="text-[var(--color-primary-gold)] underline">Account Dashboard</Link>.</li>
                  <li><strong>Right to Correction:</strong> Update outdated profile details and delivery addresses at any time.</li>
                  <li><strong>Right to Erasure / Anonymization:</strong> Request deletion or anonymization of personal account details via our <Link href="/account/security" className="text-[var(--color-primary-gold)] underline">Account Security Portal</Link>. Please note that statutory tax invoices cannot be deleted, but personal identifying details will be permanently anonymized.</li>
                  <li><strong>Right to Grievance Redressal:</strong> Submit grievances regarding data handling directly to our Grievance Officer.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  7. Grievance Officer &amp; Privacy Contact
                </h2>
                <p className="text-neutral-400">
                  In accordance with Rule 4(5) of the Consumer Protection (E-Commerce) Rules, 2020 and the DPDPA 2023, our designated Grievance Officer can be contacted at:
                </p>
                <div className="mt-3 p-4 rounded-xl bg-dark-surface border border-dark-border text-xs space-y-1.5 text-neutral-300">
                  <p><strong>Name:</strong> {BUSINESS_CONFIG.grievanceOfficer.name || "Grievance Redressal Officer"}</p>
                  <p><strong>Designation:</strong> {BUSINESS_CONFIG.grievanceOfficer.designation}</p>
                  <p><strong>Email:</strong> <a href={`mailto:${BUSINESS_CONFIG.grievanceOfficer.email}`} className="text-[var(--color-primary-gold)] underline">{BUSINESS_CONFIG.grievanceOfficer.email}</a></p>
                  <p><strong>Phone:</strong> {BUSINESS_CONFIG.grievanceOfficer.phone || "Available on request"}</p>
                  <p><strong>Address:</strong> {BUSINESS_CONFIG.grievanceOfficer.address}</p>
                  <p className="text-neutral-400 text-[11px] pt-1">
                    *Statutory Acknowledgement SLA: Within {BUSINESS_CONFIG.grievanceOfficer.ackSlaHours} hours. Resolution SLA: Within {BUSINESS_CONFIG.grievanceOfficer.resolutionSlaDays} days.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </PageContainer>
      </main>
      <Footer />
    </div>
  );
}
