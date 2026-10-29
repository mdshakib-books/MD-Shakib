"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { sendPasswordReset, type AuthActionResult } from "@/lib/auth/actions";

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    sendPasswordReset,
    null
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8 md:p-10 shadow-2xl max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)]">
                Reset Password
              </h1>
              <p className="text-neutral-400 text-xs md:text-sm mt-2">
                Enter your registered email address to receive password reset instructions.
              </p>
            </div>

            {state?.error && (
              <div className="mb-5 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs text-center">
                {state.error}
              </div>
            )}

            {state?.success && (
              <div className="mb-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center">
                {state.message}
              </div>
            )}

            <form action={formAction} className="space-y-5">
              <Input
                label="Email Address"
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                required
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isPending}
              >
                {isPending ? "Sending instructions..." : "Send Reset Link"}
              </Button>
            </form>

            <div className="text-center text-xs text-neutral-400 mt-6 pt-6 border-t border-[#2A2A2A]">
              Remembered your password?{" "}
              <Link href="/login" className="text-[#C9A24A] font-semibold hover:underline">
                Back to Login
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
