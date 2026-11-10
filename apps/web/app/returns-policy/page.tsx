import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { BUSINESS_CONFIG } from "@/lib/config/business";

export const metadata: Metadata = {
  title: "Return and Refund Policy | MD Shakib Islamic Books",
  description: "Official 7-day return and refund policy for MD Shakib Islamic Books.",
};

export default function ReturnsPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />
      <main id="main-content" className="flex-grow">
        <PageContainer size="md">
          <div className="py-12 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)] uppercase mb-2">
              Return &amp; Refund Policy
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-mono">
              Effective Date: November 2026 | Compliant with Consumer Protection (E-Commerce) Rules, 2020
            </p>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed pt-4 border-t border-dark-border">
              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  1. Statutory 7-Day Return Eligibility Window
                </h2>
                <p className="text-neutral-400">
                  At MD Shakib Islamic Books, we take profound care in preserving and distributing authentic Islamic scholarship. If you receive a book that is damaged in transit, defective, or incorrect, you are entitled to request a full return and refund within <strong>{BUSINESS_CONFIG.returns.windowDays} calendar days</strong> of verified doorstep delivery.
                </p>
                <p className="text-neutral-400 mt-2">
                  The 7-day eligibility clock begins on the exact delivery timestamp recorded by our carrier network or verified via doorstep OTP.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  2. Eligible Return Conditions
                </h2>
                <p className="text-neutral-400">
                  Returns are accepted under the following verified conditions:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li><strong>Physical Transit Damage:</strong> Torn binding, water damage, crushed spine, or mutilated pages upon receipt.</li>
                  <li><strong>Manufacturing / Printing Defects:</strong> Inverted pages, missing chapters, blank print runs, or duplicate signatures.</li>
                  <li><strong>Incorrect Title Delivered:</strong> The book received does not match the title, volume, or edition ordered.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  3. Ineligible / Non-Returnable Items
                </h2>
                <p className="text-neutral-400">
                  To protect the integrity of scholarly texts and prevent misuse:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li>Books returned with customer annotations, highlighter markings, personal marginalia, or altered bindings.</li>
                  <li>Items reported after the 7-day return window has elapsed.</li>
                  <li>Any book that has been damaged due to customer mishandling or improper storage.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  4. Return Request Submission &amp; Evidence
                </h2>
                <p className="text-neutral-400">
                  Customers can initiate a return directly from their online account:
                </p>
                <ol className="list-decimal list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li>Go to <Link href="/account/orders" className="text-[var(--color-primary-gold)] underline">My Orders</Link> and select the delivered order.</li>
                  <li>Click <strong>Request Return</strong> (available only within 7 days of delivery).</li>
                  <li>Select the return reason and provide clear photographs showing the defect, damaged packaging, or incorrect title.</li>
                  <li>Submit your request for administrative review.</li>
                </ol>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  5. Review, Reverse Pickup &amp; Refund Processing
                </h2>
                <p className="text-neutral-400">
                  Our quality assurance team reviews return requests within <strong>24 to 48 business hours</strong>:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li><strong>Reverse Pickup:</strong> Once approved, we schedule a reverse pickup at your delivery address via Delhivery. A reverse waybill is generated and the carrier will collect the securely repacked book.</li>
                  <li><strong>Refund Issuance:</strong> Upon verified courier pickup or warehouse physical inspection, the refund is authorized immediately via our payment gateway (Razorpay).</li>
                  <li><strong>Refund Method:</strong>
                    <ul className="list-disc list-inside pl-5 mt-1 space-y-1">
                      <li><em>Prepaid Orders:</em> Refunded to the original payment method (Bank Account, UPI, or Card).</li>
                      <li><em>Cash on Delivery (COD):</em> Refunded via verified NEFT/IMPS bank transfer or UPI ID provided during the return approval process.</li>
                    </ul>
                  </li>
                  <li><strong>Credit Timeline:</strong> The refund typically reflects in your bank account or payment app within <strong>5 to 7 business days</strong>.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  6. Statutory Redressal &amp; Support Contacts
                </h2>
                <p className="text-neutral-400">
                  If you encounter any difficulty with your return or refund request, please email our dedicated help desk at <a href={`mailto:${BUSINESS_CONFIG.supportEmail}`} className="text-[var(--color-primary-gold)] underline">{BUSINESS_CONFIG.supportEmail}</a> or reach out to our statutory Grievance Officer at <a href={`mailto:${BUSINESS_CONFIG.grievanceOfficer.email}`} className="text-[var(--color-primary-gold)] underline">{BUSINESS_CONFIG.grievanceOfficer.email}</a>.
                </p>
              </div>
            </div>
          </div>
        </PageContainer>
      </main>
      <Footer />
    </div>
  );
}
