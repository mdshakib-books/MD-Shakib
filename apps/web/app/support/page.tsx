"use client";

import * as React from "react";
import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer, SectionHeading } from "@/components/layout/PageContainer";

const SUPPORT_CATEGORIES = [
  "Orders & Shipping",
  "Payments & Billing",
  "Replacements & Returns",
  "Account & Login",
  "Book Inquiries",
];

const FAQS = [
  {
    question: "How long does shipping take?",
    answer:
      "Orders are typically processed within 24 to 48 hours and delivered within 3–7 business days depending on your delivery location across India.",
  },
  {
    question: "Do you offer Cash on Delivery (COD)?",
    answer:
      "Yes, Cash on Delivery is available for eligible pin codes across India alongside secure online payment via UPI, Debit/Credit Card, and Netbanking.",
  },
  {
    question: "Can I replace a damaged book?",
    answer:
      "Yes, if your book arrives damaged or with printing defects, you can request a free replacement within 7 days of delivery directly through your order details page.",
  },
  {
    question: "Are your Islamic books authentic?",
    answer:
      "All our editions are sourced directly from verified international and domestic scholarly publishers including Darussalam, Hurst, and leading Islamic institutions.",
  },
];

export default function SupportPage() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />

      <main className="flex-grow">
        {/* HERO */}
        <section className="py-16 md:py-24 text-center border-b border-[#2A2A2A]">
          <div className="max-w-[900px] mx-auto px-6">
            <h1 className="text-3xl md:text-5xl font-serif text-[#C9A24A] mb-4 uppercase">
              Support Center
            </h1>
            <p className="text-neutral-400 text-sm md:text-base max-w-lg mx-auto">
              Need assistance? Browse help categories or find instant answers in our frequently asked questions.
            </p>
          </div>
        </section>

        {/* SUPPORT CONTENT */}
        <PageContainer>
          <div className="grid md:grid-cols-[260px_1fr] gap-10 py-6">
            {/* SIDEBAR */}
            <div className="space-y-3">
              <h3 className="font-serif text-sm uppercase tracking-wider text-[var(--color-primary-gold)] mb-2">
                Help Categories
              </h3>
              {SUPPORT_CATEGORIES.map((item, index) => (
                <div
                  key={index}
                  className="p-4 border border-[#2A2A2A] rounded-lg bg-[#111111] hover:border-[#C9A24A] hover:text-[#C9A24A] transition-all cursor-pointer text-sm font-medium"
                >
                  {item}
                </div>
              ))}
            </div>

            {/* FAQ CONTENT */}
            <div>
              <SectionHeading
                title="Frequently Asked Questions"
                subtitle="Everything you need to know about purchasing, tracking, and book authentications"
                align="left"
              />

              <div className="space-y-4">
                {FAQS.map((faq, index) => (
                  <div
                    key={index}
                    className="border border-[#2A2A2A] rounded-lg overflow-hidden bg-[#111111]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFAQ(index)}
                      className="w-full text-left p-5 flex justify-between items-center hover:bg-[#161616] transition-colors cursor-pointer"
                    >
                      <span className="text-sm md:text-base font-medium text-neutral-200">
                        {faq.question}
                      </span>
                      <span className="text-[#C9A24A] text-lg font-bold">
                        {activeIndex === index ? "−" : "+"}
                      </span>
                    </button>

                    {activeIndex === index && (
                      <div className="p-5 text-neutral-400 text-sm border-t border-[#2A2A2A] bg-[#0E0E0E] leading-relaxed">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}

