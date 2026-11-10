import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { BUSINESS_CONFIG } from "@/lib/config/business";

export const metadata: Metadata = {
  title: "Terms and Conditions | MD Shakib Islamic Books",
  description: "Official terms and conditions governing online book purchases and services on MD Shakib Islamic Books.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />
      <main id="main-content" className="flex-grow">
        <PageContainer size="md">
          <div className="py-12 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)] uppercase mb-2">
              Terms &amp; Conditions of Sale
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-mono">
              Effective Date: November 2026 | Version: 2026.11-v1
            </p>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed pt-4 border-t border-dark-border">
              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  1. Introduction &amp; Legal Contracting Party
                </h2>
                <p className="text-neutral-400">
                  Welcome to {BUSINESS_CONFIG.brandName} (&quot;Website&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). These Terms and Conditions (&quot;Terms&quot;) constitute a legally binding electronic agreement under the Information Technology Act, 2000, and the Consumer Protection (E-Commerce) Rules, 2020. 
                </p>
                <p className="text-neutral-400 mt-2">
                  By accessing our website, creating an account, or placing an order, you confirm that you are at least 18 years of age and legally competent to enter into a binding contract under the Indian Contract Act, 1872.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  2. Catalog Information, Pricing &amp; Taxes
                </h2>
                <p className="text-neutral-400">
                  All book listings and descriptions represent authentic scholarly literature. Prices are displayed in Indian Rupees (₹ INR):
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><strong>Physical Books GST Exemption:</strong> In accordance with Notification No. 12/2017-Central Tax (Rate), printed books (HSN 4901) are exempt from Goods and Services Tax (0% GST rate).</li>
                  <li><strong>Shipping &amp; Logistics GST:</strong> Transportation and courier services incur 18% GST (CGST 9% + SGST 9% for intra-state delivery, or IGST 18% for inter-state delivery), which is fully inclusive in the displayed shipping fee.</li>
                  <li><strong>Price Accuracy:</strong> While we endeavor to ensure all catalog prices are accurate, in the rare event of a palpable technical error, we reserve the right to notify you and cancel or refund the order prior to shipment.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  3. Order Placement, Contract Formation &amp; Consent
                </h2>
                <p className="text-neutral-400">
                  When you submit an order on our platform, you make an offer to purchase the selected books. 
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><strong>Explicit Consent:</strong> To complete a purchase, you must provide affirmative consent by checking the terms agreement box on the checkout page. The timestamp, policy version, and your session details are recorded server-side.</li>
                  <li><strong>Order Acknowledgement vs. Acceptance:</strong> The initial order confirmation email acknowledges receipt of your request. A binding contract of sale is formed only when your order is packed and dispatched from our warehouse, marked by the assignment of a courier Air Waybill (AWB).</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  4. Shipping, Cancellation &amp; Returns
                </h2>
                <p className="text-neutral-400">
                  Your purchase is governed by our dedicated statutory policies, which are incorporated into these Terms by reference:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1 mt-2">
                  <li><Link href="/shipping-policy" className="text-[var(--color-primary-gold)] underline font-medium">Shipping Policy</Link>: Governs delivery coverage, Delhivery carrier tracking, 3–7 business day transit SLAs, and doorstep OTP verification.</li>
                  <li><Link href="/cancellation-policy" className="text-[var(--color-primary-gold)] underline font-medium">Cancellation Policy</Link>: Governs pre-dispatch cancellation rights, inventory release, and automatic payment gateway refund initiation.</li>
                  <li><Link href="/returns-policy" className="text-[var(--color-primary-gold)] underline font-medium">Return &amp; Refund Policy</Link>: Enforces the statutory 7-day return eligibility window for damaged, defective, or incorrect titles, with reverse pickup and gateway refund processing.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  5. User Account Security
                </h2>
                <p className="text-neutral-400">
                  You are solely responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized account access.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  6. Intellectual Property
                </h2>
                <p className="text-neutral-400">
                  All website designs, typography, brand assets, logos, and curated book editorial descriptions are the intellectual property of {BUSINESS_CONFIG.brandName}. The copyright of published literature remains with the respective authors and original scholarly publishers.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  7. Governing Law &amp; Jurisdiction
                </h2>
                <p className="text-neutral-400">
                  These Terms and any dispute or claim arising out of or in connection with them shall be governed by and construed in accordance with the laws of India. Any legal proceedings arising from transactions on this platform shall be subject to the exclusive jurisdiction of the {BUSINESS_CONFIG.jurisdiction}.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  8. Statutory Grievance Redressal
                </h2>
                <p className="text-neutral-400">
                  In compliance with the Consumer Protection (E-Commerce) Rules, 2020, consumers may direct any concerns or unresolved complaints to our designated Grievance Officer:
                </p>
                <div className="mt-2 text-xs text-neutral-300">
                  <p><strong>Grievance Officer:</strong> {BUSINESS_CONFIG.grievanceOfficer.name || "Designated Officer"}</p>
                  <p><strong>Email:</strong> <a href={`mailto:${BUSINESS_CONFIG.grievanceOfficer.email}`} className="text-[var(--color-primary-gold)] underline">{BUSINESS_CONFIG.grievanceOfficer.email}</a></p>
                  <p><strong>Acknowledgement SLA:</strong> Within 48 hours | <strong>Resolution SLA:</strong> Within 30 days.</p>
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
