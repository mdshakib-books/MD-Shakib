"use client";

import * as React from "react";
import { useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signUpCustomer, type AuthActionResult } from "@/lib/auth/actions";

function RegisterForm() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect") || "/profile";

  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    signUpCustomer,
    null
  );

  return (
    <div className="bg-dark-surface border border-dark-border rounded-2xl p-8 md:p-10 shadow-luxury max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)]">
          Create Account
        </h1>
        <p className="text-neutral-400 text-xs md:text-sm mt-2">
          Join MD Shakib Books for saved orders, addresses, and updates.
        </p>
      </div>

      {state?.error && (
        <div className="mb-5 p-3.5 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs text-center flex items-center justify-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="redirect" value={redirectParam} />

        <Input
          label="Full Name"
          id="name"
          name="name"
          placeholder="Mohammad Shakib"
          required
        />

        <Input
          label="Email Address"
          id="email"
          name="email"
          type="email"
          placeholder="name@example.com"
          required
        />

        <Input
          label="Password"
          id="password"
          name="password"
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
          {isPending ? "Creating Account..." : "Register"}
        </Button>
      </form>

      <div className="text-center text-xs text-neutral-400 mt-6 pt-6 border-t border-dark-border">
        Already have an account?{" "}
        <Link
          href={redirectParam !== "/profile" ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login"}
          className="text-[var(--color-primary-gold)] font-semibold hover:text-[var(--color-accent-gold)] transition-colors"
        >
          Log In
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <Suspense fallback={<div className="text-center py-12 text-neutral-400">Loading registration...</div>}>
            <RegisterForm />
          </Suspense>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
