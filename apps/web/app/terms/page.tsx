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
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />
      <main className="flex-grow">
        <PageContainer size="md">
          <div className="py-8 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#C9A24A] uppercase mb-4">
              Terms &amp; Conditions
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider">Effective: October 2026</p>

            <div className="space-y-4 text-neutral-300 text-sm leading-relaxed">
              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">1. Orders &amp; Acceptance</h2>
              <p>
                By placing an order on MD Shakib Islamic Books, you agree that all information provided is accurate and complete. An order receipt email confirms receipt of your order but does not constitute contractual acceptance until the order is dispatched.
              </p>

              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">2. Pricing &amp; Availability</h2>
              <p>
                All book prices are listed in Indian Rupees (INR) and are inclusive of applicable taxes. In the event of a typographical error in pricing or stock availability, we reserve the right to cancel or refund affected orders prior to shipment.
              </p>

              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">3. Delivery &amp; Replacements</h2>
              <p>
                Delivery times are estimates provided by logistics partners. In accordance with our replacement policy, damaged or defective books are eligible for a replacement within 7 days of verified delivery.
              </p>
            </div>
          </div>
        </PageContainer>
      </main>
      <Footer />
    </div>
  );
}

