import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <Suspense fallback={<div className="text-center py-12 text-neutral-500">Loading...</div>}>
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8 md:p-10 shadow-2xl max-w-md mx-auto text-center">
              <div className="w-16 h-16 rounded-full bg-[#C9A24A]/10 border border-[#C9A24A]/30 text-[#C9A24A] flex items-center justify-center text-3xl mx-auto mb-6">
                ✉️
              </div>

              <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)] mb-2">
                Check Your Email
              </h1>

              <p className="text-neutral-400 text-xs md:text-sm leading-relaxed mb-8">
                We have sent an authentication or verification code to your email. Please check your inbox and enter the 6-digit code.
              </p>

              <Link
                href="/verify-otp"
                className="block w-full py-3 rounded-xl bg-[var(--color-primary-gold)] text-black font-bold text-xs uppercase tracking-wider hover:bg-[var(--color-accent-gold)] transition-colors text-center"
              >
                Enter Verification OTP
              </Link>

              <div className="text-center text-xs text-neutral-500 mt-6 pt-6 border-t border-[#2A2A2A]">
                Didn&apos;t receive email? Check spam folder or{" "}
                <Link href="/support" className="text-[#C9A24A] hover:underline">
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
