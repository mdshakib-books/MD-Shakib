"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { submitContactForm } from "@/lib/support/contact";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative py-16 md:py-24 text-center border-b border-dark-border overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/95" />
          <div className="relative z-10 max-w-[800px] mx-auto px-6">
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-[var(--color-primary-gold)] mb-4 tracking-wide uppercase">
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
                <h2 className="font-serif text-2xl text-[var(--color-primary-gold)] mb-2 uppercase tracking-wide">
                  Get in Touch
                </h2>
                <p className="text-neutral-400 text-sm leading-relaxed font-light">
                  Have a question about our classical Islamic collection or need help with your recent order? Reach out through any of our official support channels.
                </p>
              </div>

              {/* Channels Grid */}
              <div className="space-y-4 pt-2">
                {/* WhatsApp */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-dark-surface border border-dark-border hover:border-[var(--color-primary-gold)] transition-colors">
                  <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-neutral-100 font-semibold">
                      WhatsApp Support
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      Direct customer assistance for order updates and quick queries.
                    </p>
                    <a
                      href="https://wa.me/919876543210"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] transition-colors mt-2"
                    >
                      <span>Chat on WhatsApp</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </a>
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-dark-surface border border-dark-border hover:border-[var(--color-primary-gold)] transition-colors">
                  <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-neutral-100 font-semibold">
                      Email Help Desk
                    </h3>
                    <p className="text-neutral-400 text-xs mt-1">
                      For institutional book sourcing, publishing queries, and order concerns.
                    </p>
                    <a
                      href="mailto:support@mdshakib.com"
                      className="inline-block text-xs font-semibold text-[var(--color-primary-gold)] hover:underline mt-2"
                    >
                      support@mdshakib.com
                    </a>
                  </div>
                </div>

                {/* Operating Hours */}
                <div className="flex items-start gap-4 p-5 rounded-xl bg-dark-surface border border-dark-border">
                  <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-[var(--color-primary-gold)] shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-serif text-base text-neutral-100 font-semibold">
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
            <div className="p-8 rounded-2xl bg-dark-surface border border-dark-border shadow-luxury">
              <h3 className="font-serif text-xl text-neutral-100 font-semibold mb-2 uppercase tracking-wide">
                Send a Message
              </h3>
              <p className="text-neutral-400 text-xs mb-6 font-light">
                Fill in the details below and our team will get back to you within 24 hours.
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
