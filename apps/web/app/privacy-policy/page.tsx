import { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Privacy Policy | MD Shakib Islamic Books",
  description: "Learn how MD Shakib Islamic Books protects and manages your personal information and privacy.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />
      <main className="flex-grow">
        <PageContainer size="md">
          <div className="py-8 space-y-6">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#C9A24A] uppercase mb-4">
              Privacy Policy
            </h1>
            <p className="text-xs text-neutral-500 uppercase tracking-wider">Last updated: October 2026</p>

            <div className="space-y-4 text-neutral-300 text-sm leading-relaxed">
              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">1. Information We Collect</h2>
              <p>
                We collect personal information that you provide when registering, placing an order, or contacting customer support. This includes your name, email address, phone number, and delivery address.
              </p>

              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">2. How We Use Your Information</h2>
              <p>
                Your information is used strictly to process orders, fulfill shipments with delivery partners (Delhivery), provide tracking updates, and communicate important transactional notices regarding your purchases.
              </p>

              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">3. Payment Security</h2>
              <p>
                We do not store your complete credit card or payment card information on our servers. All digital payments are processed through PCI-DSS compliant payment gateways (Razorpay).
              </p>

              <h2 className="font-serif text-xl text-neutral-100 font-semibold mt-6">4. Data Protection &amp; Contact</h2>
              <p>
                We implement industry-standard encryption and security measures. For any privacy inquiries or data requests, please contact us at support@mdshakib.com.
              </p>
            </div>
          </div>
        </PageContainer>
      </main>
      <Footer />
    </div>
  );
}

