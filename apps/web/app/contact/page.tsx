"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />

      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative py-16 md:py-24 text-center border-b border-[#2A2A2A] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95" />
          <div className="relative z-10 max-w-[800px] mx-auto px-6">
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[#C9A24A] mb-4 tracking-wide uppercase">
              Contact Us
            </h1>
            <p className="text-neutral-300 text-sm md:text-base leading-relaxed font-light">
              We are here to assist you with book inquiries, order tracking, authentic scholarly titles, and customer support.
            </p>
          </div>
        </section>

        {/* CONTACT CHANNELS & FORM */}
        <PageContainer>
          <div className="grid md:grid-cols-2 gap-12 py-12">
            {/* Contact Information & Channels */}
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-[#C9A24A] mb-2 uppercase tracking-wide">
                  Get in Touch
                </h2>
                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Have a question about our classical Islamic collection or need help with your recent order? Reach out through any of our official support channels.
                </p>
              </div>

              {/* Channels Grid */}
              <div className="space-y-4 pt-2">
                {/* WhatsApp */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-[#111111] border border-[#2A2A2A] hover:border-[#C9A24A] transition-colors">
                  <div className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#C9A24A] shrink-0 text-xl">
                    💬
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-[#F5F5F5] font-semibold">
                      WhatsApp Support
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      Direct customer assistance for order updates and quick queries.
                    </p>
                    <a
                      href="https://wa.me/919876543210"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs font-semibold text-[#C9A24A] hover:underline mt-2"
                    >
                      Chat on WhatsApp &rarr;
                    </a>
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-[#111111] border border-[#2A2A2A] hover:border-[#C9A24A] transition-colors">
                  <div className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#C9A24A] shrink-0 text-xl">
                    ✉️
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-[#F5F5F5] font-semibold">
                      Email Help Desk
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      For institutional book sourcing, publishing queries, and order concerns.
                    </p>
                    <a
                      href="mailto:support@mdshakib.com"
                      className="inline-block text-xs font-semibold text-[#C9A24A] hover:underline mt-2"
                    >
                      support@mdshakib.com
                    </a>
                  </div>
                </div>

                {/* Operating Hours */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-[#111111] border border-[#2A2A2A]">
                  <div className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#C9A24A] shrink-0 text-xl">
                    🕒
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-[#F5F5F5] font-semibold">
                      Operating Hours
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      Monday to Saturday: 9:00 AM – 7:00 PM IST
                    </p>
                    <p className="text-neutral-500 text-[11px] mt-0.5">
                      Closed on Sundays and major Islamic holidays.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Inquiry Form */}
            <div className="p-8 rounded-2xl bg-[#111111] border border-[#2A2A2A]">
              <h3 className="font-serif text-xl text-[#F5F5F5] font-semibold mb-2 uppercase tracking-wide">
                Send a Message
              </h3>
              <p className="text-neutral-400 text-xs mb-6 font-light">
                Fill in the details below and our team will get back to you within 24 hours.
              </p>

              {submitted ? (
                <div className="p-6 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-900/40 text-emerald-400 flex items-center justify-center mx-auto mb-3 text-xl">
                    ✓
                  </div>
                  <h4 className="font-serif text-emerald-400 text-base font-semibold">
                    Message Received
                  </h4>
                  <p className="text-neutral-300 text-xs mt-2">
                    JazakAllah Khair for reaching out. We will respond to your email shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setName("");
                      setEmail("");
                      setSubject("");
                      setMessage("");
                    }}
                    className="mt-4 px-4 py-2 text-xs font-semibold text-[#C9A24A] hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                      Your Full Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ahmad Khan"
                      className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A] transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                      Email Address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. ahmad@example.com"
                      className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A] transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                      Subject
                    </label>
                    <input
                      id="subject"
                      name="subject"
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject (e.g. Order #ORD-1234 Status)"
                      className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A] transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we assist you today?"
                      className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-[#C9A24A] transition resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-[#C9A24A] text-black font-semibold rounded-lg hover:bg-[#E5C87B] transition shadow-md text-sm cursor-pointer"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
