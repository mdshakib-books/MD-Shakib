"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { submitContactForm } from "@/lib/support/contact";
import { BUSINESS_CONFIG, getBusinessDisclosures } from "@/lib/config/business";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disclosures = getBusinessDisclosures();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const res = await submitContactForm({
        name,
        email,
        subject,
        message,
      });

      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setSubmitted(true);
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-[#F5F5F5]">
      <Navbar />

      <main id="main-content" className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative py-16 md:py-24 text-center border-b border-dark-border overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95" />
          <div className="relative z-10 max-w-[800px] mx-auto px-6">
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[var(--color-primary-gold)] mb-4 tracking-wide uppercase">
              Contact &amp; Customer Support
            </h1>
            <p className="text-neutral-300 text-sm md:text-base leading-relaxed font-light">
              We are dedicated to authentic Islamic scholarship. Reach out to our customer support desk or statutory grievance redressal officer.
            </p>
          </div>
        </section>

        {/* CONTACT CHANNELS & FORM */}
        <PageContainer>
          <div className="grid md:grid-cols-2 gap-12 py-12">
            {/* Contact Information & Channels */}
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-[var(--color-primary-gold)] mb-2 uppercase tracking-wide">
                  Official Channels
                </h2>
                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Have a question regarding book availability, classical editions, or order tracking? Contact us through our verified channels.
                </p>
              </div>

              {/* Channels Grid */}
              <div className="space-y-4 pt-2">
                {/* Email Help Desk */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-dark-surface border border-dark-border hover:border-[var(--color-primary-gold)] transition-colors">
                  <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-neutral-100 font-semibold">
                      Customer Support Email
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      For order tracking, book sourcing, and general inquiries.
                    </p>
                    <a
                      href={`mailto:${disclosures.supportEmail}`}
                      className="inline-block text-xs font-semibold text-[var(--color-primary-gold)] hover:underline mt-2 font-mono"
                    >
                      {disclosures.supportEmail}
                    </a>
                  </div>
                </div>

                {/* Telephone Support */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-dark-surface border border-dark-border hover:border-[var(--color-primary-gold)] transition-colors">
                  <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-neutral-100 font-semibold">
                      Telephone Support
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      Available during operating hours: Monday – Saturday, 9:00 AM – 7:00 PM IST.
                    </p>
                    {disclosures.displayPhone ? (
                      <a
                        href={`tel:${disclosures.displayPhone}`}
                        className="inline-block text-xs font-semibold text-[var(--color-primary-gold)] hover:underline mt-2 font-mono"
                      >
                        {disclosures.displayPhone}
                      </a>
                    ) : (
                      <span className="inline-block text-xs text-neutral-400 mt-2 font-mono">
                        Direct helpline details available upon request
                      </span>
                    )}
                  </div>
                </div>

                {/* Registered Office */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-dark-surface border border-dark-border">
                  <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-neutral-100 font-semibold">
                      Registered Business Address
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1 leading-relaxed">
                      {disclosures.displayAddress}
                    </p>
                    {disclosures.gstin && (
                      <p className="text-neutral-400 text-[11px] mt-1 font-mono">
                        GSTIN: {disclosures.gstin}
                      </p>
                    )}
                  </div>
                </div>

                {/* Statutory Grievance Redressal (Rule 4(5)) */}
                <div className="p-5 rounded-xl bg-[#C9A24A]/5 border border-[#C9A24A]/30">
                  <h3 className="font-serif text-sm font-bold text-[#E5C87B] uppercase tracking-wide">
                    Statutory Grievance Redressal Officer
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                    Under Rule 4(5) of Consumer Protection (E-Commerce) Rules, 2020:
                  </p>
                  <div className="mt-2 text-xs text-neutral-300 space-y-1">
                    <p><strong>Officer:</strong> {BUSINESS_CONFIG.grievanceOfficer.name || "Grievance Redressal Officer"}</p>
                    <p><strong>Designation:</strong> {BUSINESS_CONFIG.grievanceOfficer.designation}</p>
                    <p><strong>Email:</strong> <a href={`mailto:${BUSINESS_CONFIG.grievanceOfficer.email}`} className="text-[#C9A24A] underline font-mono">{BUSINESS_CONFIG.grievanceOfficer.email}</a></p>
                    <p className="text-[11px] text-neutral-400 pt-1">
                      Statutory SLA: Ticket acknowledged within 48 hours; resolved within 30 days.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Inquiry Form */}
            <div className="p-8 rounded-2xl bg-dark-surface border border-dark-border shadow-luxury">
              <h3 className="font-serif text-xl text-neutral-100 font-semibold mb-2 uppercase tracking-wide">
                Send an Inquiry
              </h3>
              <p className="text-neutral-400 text-xs mb-6 font-light">
                Fill in the details below and our bookstore team will respond within 24 hours.
              </p>

              {errorMsg && (
                <div role="alert" className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs flex items-center justify-between">
                  <span>{errorMsg}</span>
                  <button
                    type="button"
                    onClick={() => setErrorMsg(null)}
                    className="text-neutral-400 hover:text-white ml-2 text-xs underline focus:outline-none"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {submitted ? (
                <div className="p-8 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-center animate-fade-in-up">
                  <div className="w-12 h-12 rounded-full bg-emerald-900/30 text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="font-serif text-emerald-400 text-base font-semibold">
                    Message Received
                  </h4>
                  <p className="text-neutral-300 text-xs mt-2 max-w-xs mx-auto">
                    JazakAllah Khair for reaching out. We have sent an email acknowledgement and will respond shortly.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSubmitted(false);
                      setName("");
                      setEmail("");
                      setSubject("");
                      setMessage("");
                      setErrorMsg(null);
                    }}
                    className="mt-5"
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label="Your Full Name"
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ahmad Khan"
                    disabled={isPending}
                  />

                  <Input
                    label="Email Address"
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. ahmad@example.com"
                    disabled={isPending}
                  />

                  <Input
                    label="Subject"
                    id="subject"
                    name="subject"
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject (e.g. Order Status, Title Availability)"
                    disabled={isPending}
                  />

                  <Textarea
                    label="Message"
                    id="message"
                    name="message"
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="How can we assist you today?"
                    disabled={isPending}
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full mt-2"
                    disabled={isPending}
                  >
                    {isPending ? "Sending Inquiry..." : "Send Message"}
                  </Button>
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
