import { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { BUSINESS_CONFIG } from "@/lib/config/business";

export const metadata: Metadata = {
  title: "Cancellation Policy | MD Shakib Islamic Books",
  description: "Official order cancellation terms, conditions, and refund procedures for MD Shakib Islamic Books.",
};

export default function CancellationPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />
      <main id="main-content" className="flex-grow">
        <PageContainer size="md">
          <div className="py-12 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)] uppercase mb-2">
              Order Cancellation Policy
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-mono">
              Effective Date: November 2026 | Compliant with Consumer Protection (E-Commerce) Rules, 2020
            </p>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed pt-4 border-t border-dark-border">
              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  1. Cancellation Window Prior to Dispatch
                </h2>
                <p className="text-neutral-400">
                  Customers may cancel any order free of charge at any time <strong>prior to physical courier dispatch</strong>. As long as your order status shows as <em>Pending</em> or <em>Processing</em> in your account, you can initiate cancellation with a single click.
                </p>
                <p className="text-neutral-400 mt-2">
                  Once your order has been packaged and handed over to the courier (status marked as <strong>Shipped</strong> with an assigned Air Waybill), the order cannot be cancelled in-transit. In such cases, you may refuse delivery at your doorstep or initiate a return following our <Link href="/returns-policy" className="text-[var(--color-primary-gold)] underline">Return &amp; Refund Policy</Link>.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  2. Cash on Delivery (COD) Cancellations
                </h2>
                <p className="text-neutral-400">
                  For COD orders cancelled prior to dispatch, no financial refund is necessary. Reserved book inventory is automatically and atomically restored to the active catalog, and any applied promotional coupon is released back to your account.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  3. Online Prepaid Order Cancellations &amp; Gateway Refunds
                </h2>
                <p className="text-neutral-400">
                  If you cancel a prepaid order (paid via UPI, Credit/Debit Card, or NetBanking) before dispatch:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li>The full order value (including book cost, shipping charges, and platform fees) will be refunded automatically to your <strong>original payment source</strong> via our PCI-DSS compliant payment gateway (Razorpay).</li>
                  <li>Refund initiation is executed immediately on our server. Depending on your issuing bank / UPI provider, the credited amount will reflect in your account within <strong>5 to 7 business days</strong>.</li>
                  <li>A formal credit note and refund document are generated and available in your customer account.</li>
                </ul>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  4. Cancellation by MD Shakib Islamic Books
                </h2>
                <p className="text-neutral-400">
                  We reserve the right to cancel an order under limited, exceptional operational circumstances:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li>Unforeseen physical inventory damage discovered during pre-shipment quality inspection.</li>
                  <li>Inability of logistics partners to safely service the destination pincode.</li>
                  <li>Unresolved security or payment gateway fraud flags.</li>
                  <li>Typographical error in pricing or catalog listing.</li>
                </ul>
                <p className="text-neutral-400 mt-2">
                  In the event of an merchant-initiated cancellation, you will receive immediate email notification and a 100% full refund to your original payment method.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">
                  5. How to Cancel Your Order
                </h2>
                <ol className="list-decimal list-inside text-neutral-400 space-y-1.5 mt-2">
                  <li>Log in and navigate to <Link href="/account/orders" className="text-[var(--color-primary-gold)] underline">My Orders</Link>.</li>
                  <li>Select the order you wish to cancel.</li>
                  <li>Click the <strong>Cancel Order</strong> button (visible only if eligible prior to courier dispatch).</li>
                  <li>Select a reason for cancellation and confirm.</li>
                </ol>
                <p className="text-neutral-400 mt-3">
                  For assistance, please email our support team at <a href={`mailto:${BUSINESS_CONFIG.supportEmail}`} className="text-[var(--color-primary-gold)] underline">{BUSINESS_CONFIG.supportEmail}</a> with your order number.
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
