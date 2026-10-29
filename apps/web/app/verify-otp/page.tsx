"use client";

import * as React from "react";
import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { verifyEmailOtp, type AuthActionResult } from "@/lib/auth/actions";

function VerifyOtpContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";
  const typeParam = searchParams.get("type") || "signup";

  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    verifyEmailOtp,
    null
  );

  return (
    <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8 md:p-10 shadow-2xl max-w-md mx-auto text-center">
      <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)] mb-2">
        Verify Account
      </h1>
      <p className="text-neutral-400 text-xs md:text-sm mb-8">
        Enter the 6-digit one-time verification code sent to your email.
      </p>

      {state?.error && (
        <div className="mb-5 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs text-center">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-6">
        <input type="hidden" name="type" value={typeParam} />

        <Input
          label="Registered Email"
          id="email"
          name="email"
          type="email"
          defaultValue={emailParam}
          required
        />

        <div>
          <label htmlFor="token" className="block text-xs font-medium text-neutral-300 mb-1.5 text-left">
            6-Digit Verification Code
          </label>
          <Input
            id="token"
            name="token"
            placeholder="123456"
            maxLength={6}
            className="text-center tracking-widest text-lg font-mono"
            required
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? "Verifying..." : "Verify Code"}
        </Button>
      </form>

      <div className="text-center text-xs text-neutral-500 mt-6 pt-6 border-t border-[#2A2A2A]">
        Didn&apos;t receive code? Check spam or{" "}
        <Link href="/support" className="text-[#C9A24A] hover:underline">
          Contact Support
        </Link>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <Suspense fallback={<div className="text-center py-12 text-neutral-500">Loading form...</div>}>
            <VerifyOtpContent />
          </Suspense>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
