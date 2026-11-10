import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Terms and Conditions | MD Shakib Islamic Books",
  description: "Terms and Conditions governing the use of MD Shakib Islamic Books website and order fulfillment.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />
      <main className="flex-grow">
        <PageContainer size="md">
          <div className="py-12 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)] uppercase mb-2">
              Terms &amp; Conditions
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider font-mono">Effective: October 2026</p>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed pt-4 border-t border-dark-border">
              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">1. Orders &amp; Acceptance</h2>
                <p className="text-neutral-400">
                  By placing an order on MD Shakib Islamic Books, you agree that all information provided is accurate and complete. An order receipt email confirms receipt of your order but does not constitute contractual acceptance until the order is dispatched.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">2. Pricing &amp; Availability</h2>
                <p className="text-neutral-400">
                  All book prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes. In the event of a typographical error in pricing or stock availability, we reserve the right to cancel or refund affected orders prior to shipment.
                </p>
              </div>

              <div>
                <h2 className="font-serif text-lg text-neutral-100 font-semibold mb-2">3. Delivery &amp; Returns</h2>
                <p className="text-neutral-400">
                  Delivery times are estimates provided by logistics partners. In accordance with our return policy, damaged or defective books are eligible for return and full refund within 7 days of verified delivery.
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
