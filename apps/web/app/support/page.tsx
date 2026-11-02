"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer, SectionHeading } from "@/components/layout/PageContainer";

const SUPPORT_CATEGORIES = [
  "Order Information",
  "Return / Replacement",
  "Delivery / Shipping",
  "Cancellation / Modify",
  "Refunds",
  "Coupons",
  "Account Help",
  "Other Queries",
];

const FAQ_DATA = [
  {
    question: "How can I check the status of my order?",
    answer: "You can check your order status by visiting the Orders page in your account dashboard.",
  },
  {
    question: "How do I know if my order is confirmed?",
    answer: "Once your order is placed successfully, you will receive an order confirmation message or email.",
  },
  {
    question: "What is the minimum order value?",
    answer: "Currently there is no minimum order value required to place an order.",
  },
  {
    question: "Do you deliver outside India?",
    answer: "Currently we deliver within India only. International shipping will be added soon.",
  },
  {
    question: "Is it mandatory to create an account?",
    answer: "No, but creating an account helps you track orders and manage purchases easily.",
  },
  {
    question: "How do I cancel my order?",
    answer: "You can cancel your order from the Orders section before it gets shipped.",
  },
  {
    question: "What is the shipping cost?",
    answer: "Shipping charges depend on your delivery location and will be shown at checkout.",
  },
  {
    question: "How do I request a refund?",
    answer: "Refund requests can be submitted from the Orders page if the order is eligible.",
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
            <p className="text-neutral-400 text-sm md:text-base max-w-lg mx-auto font-light">
              Need help? Browse help topics or find answers in our frequently asked questions.
            </p>
          </div>
        </section>

        {/* SUPPORT CONTENT */}
        <PageContainer>
          <div className="grid md:grid-cols-[260px_1fr] gap-10 py-10">
            {/* SIDEBAR */}
            <div className="space-y-3">
              <h3 className="font-serif text-sm uppercase tracking-wider text-[var(--color-primary-gold)] mb-2 font-semibold">
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
                subtitle="Everything you need to know about purchasing, tracking, and customer policies"
                align="left"
              />

              <div className="space-y-4">
                {FAQ_DATA.map((faq, index) => (
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
                      <span className="text-[#C9A24A] text-lg font-bold ml-4">
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

        {/* CONTACT HELP BANNER */}
        <section className="py-16 text-center border-t border-[#2A2A2A] bg-[#111111]">
          <div className="max-w-[700px] mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-serif text-[#C9A24A] mb-4 uppercase">
              Still Need Help?
            </h2>

            <p className="text-neutral-400 mb-6 text-sm md:text-base font-light">
              If you cannot find the answer to your question, feel free to contact our support team.
            </p>

            <Link
              href="/contact"
              className="inline-block px-8 py-3 bg-[#C9A24A] text-black rounded-lg font-semibold hover:bg-[#E5C87B] transition-all shadow-md"
            >
              Contact Support
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
