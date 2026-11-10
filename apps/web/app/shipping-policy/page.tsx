import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { BUSINESS_CONFIG } from "@/lib/config/business";

export const metadata: Metadata = {
  title: "Shipping Policy | MD Shakib Islamic Books",
  description: "Official shipping, dispatch, and delivery policy for MD Shakib Islamic Books.",
};

export default function ShippingPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />
      <main id="main-content" className="flex-grow">
        <PageContainer size="md">
          <div className="py-12 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)] uppercase mb-2">
              Shipping &amp; Delivery Policy
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-mono">
              Effective Date: November 2026 | Compliant with Consumer Protection (E-Commerce) Rules, 2020
            </p>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed pt-4 border-t border-dark-border">
              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  1. Shipping Coverage &amp; Serviceable Pincodes
                </h2>
                <p className="text-neutral-400">
                  MD Shakib Islamic Books ships physical books across India in partnership with leading authorized courier networks, primarily <strong>Delhivery Logistics</strong>. We deliver to over 18,000+ Indian postal pincodes. 
                </p>
                <p className="text-neutral-400 mt-2">
                  Before order confirmation, your 6-digit delivery pincode is verified against our logistics network database. If a remote or non-serviceable pincode is entered, the system will alert you before payment.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  2. Shipping Charges &amp; Transparency
                </h2>
                <p className="text-neutral-400">
                  Standard surface shipping across India is charged at a flat rate of <strong>₹{BUSINESS_CONFIG.shipping.standardShippingFee}</strong> per order (inclusive of 18% transportation GST).
                </p>
                <p className="text-neutral-400 mt-2">
                  All applicable delivery charges and platform handling fees are transparently displayed in a single figure breakdown during checkout prior to payment. There are zero hidden fees.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  3. Order Processing &amp; Dispatch Timelines
                </h2>
                <p className="text-neutral-400">
                  Orders are processed and packaged at our central fulfillment warehouse within <strong>24 to 48 hours</strong> (excluding Sundays and national holidays). Once your parcel is handed over to the courier, an Air Waybill (AWB) number is generated and assigned to your order.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  4. Estimated Delivery Timelines
                </h2>
                <ul className="list-disc list-inside text-neutral-400 space-y-1.5 mt-1">
                  <li><strong>Delhi NCR &amp; North India Metro Areas:</strong> 2 to 4 business days.</li>
                  <li><strong>Rest of India (State Capitals &amp; Tier-1 Cities):</strong> 3 to 5 business days.</li>
                  <li><strong>Tier-2 / Tier-3 &amp; Rural Locations:</strong> 5 to 7 business days.</li>
                  <li><strong>Special Regions (J&amp;K, Northeast India, Island Territories):</strong> 7 to 10 business days.</li>
                </ul>
                <p className="text-xs text-neutral-500 mt-2">
                  *Delivery timelines are reasonable estimates provided by logistics carriers and may be subject to minor delays due to adverse weather, festival carrier backlogs, or regulatory road transit checks.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  5. Consignment Tracking &amp; Delivery Updates
                </h2>
                <p className="text-neutral-400">
                  Once your shipment is dispatched, you will receive an automated tracking notification via email. You can also view live milestone tracking (pickup, in-transit, out-for-delivery) by visiting your <Link href="/account/orders" className="text-[var(--color-primary-gold)] underline">Order History</Link> in your account.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  6. Doorstep Delivery &amp; OTP Verification
                </h2>
                <p className="text-neutral-400">
                  To safeguard against package misdelivery or doorstep fraud, high-value orders and Cash on Delivery (COD) shipments may require a secure One-Time Password (OTP) verification upon delivery. The OTP is accessible inside your verified customer portal and must be shared with the courier agent only upon physical parcel handover.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  7. Damaged, Incomplete, or Undeliverable Shipments
                </h2>
                <p className="text-neutral-400">
                  If the outer package arrives visibly torn, opened, or tampered with, please reject the delivery or inspect the contents immediately in the presence of the delivery agent. 
                </p>
                <p className="text-neutral-400 mt-2">
                  In the event of carrier return due to an incorrect or incomplete address provided by the customer, our team will contact you to confirm details before scheduling re-dispatch. For immediate shipping assistance, please write to <a href={`mailto:${BUSINESS_CONFIG.supportEmail}`} className="text-[var(--color-primary-gold)] underline">{BUSINESS_CONFIG.supportEmail}</a>.
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
