import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <Suspense fallback={<div className="text-center py-12 text-neutral-500">Loading...</div>}>
            <div className="bg-dark-surface border border-dark-border rounded-2xl p-8 md:p-10 shadow-luxury max-w-md mx-auto text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-primary-gold)]/10 border border-[var(--color-primary-gold)]/30 text-[var(--color-primary-gold)] flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(201,162,74,0.15)]">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)] mb-2">
                Check Your Email
              </h1>

              <p className="text-neutral-400 text-xs md:text-sm leading-relaxed mb-8">
                We have sent an authentication or verification code to your email. Please check your inbox and enter the 6-digit code.
              </p>

              <Link href="/verify-otp" className="block w-full">
                <Button variant="primary" size="lg" className="w-full">
                  Enter Verification OTP
                </Button>
              </Link>

              <div className="text-center text-xs text-neutral-500 mt-6 pt-6 border-t border-dark-border">
                Didn&apos;t receive email? Check spam folder or{" "}
                <Link href="/support" className="text-[var(--color-primary-gold)] hover:underline">
                  Contact Support
                </Link>
              </div>
            </div>
          </Suspense>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
