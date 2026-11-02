"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updatePassword, type AuthActionResult } from "@/lib/auth/actions";

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    updatePassword,
    null
  );

  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <div className="bg-dark-surface border border-dark-border rounded-2xl p-8 md:p-10 shadow-luxury max-w-md mx-auto text-center">
            <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)] mb-2">
              Set New Password
            </h1>
            <p className="text-neutral-400 text-xs md:text-sm mb-8">
              Choose a strong new password for your MD Shakib account.
            </p>

            {state?.error && (
              <div className="mb-5 p-3.5 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs text-center flex items-center justify-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{state.error}</span>
              </div>
            )}

            <form action={formAction} className="space-y-5 text-left">
              <Input
                label="New Password"
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />

              <Input
                label="Confirm New Password"
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
              />

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isPending}
              >
                {isPending ? "Updating Password..." : "Save New Password"}
              </Button>
            </form>

            <div className="text-center text-xs text-neutral-400 mt-6 pt-6 border-t border-dark-border">
              Return to{" "}
              <Link href="/login" className="text-[var(--color-primary-gold)] font-semibold hover:text-[var(--color-accent-gold)] transition-colors">
                Login Page
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
