"use client";

import * as React from "react";
import { useState, useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { loginCustomer, type AuthActionResult } from "@/lib/auth/actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect") || "/profile";
  const messageParam = searchParams.get("message");

  const [state, formAction, isPending] = useActionState<AuthActionResult | null, FormData>(
    loginCustomer,
    null
  );

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="bg-dark-surface border border-dark-border rounded-2xl p-8 md:p-10 shadow-luxury max-w-md mx-auto animate-fade-in-up">
      <div className="text-center mb-8">
        <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)]">
          Welcome Back
        </h1>
        <p className="text-neutral-400 text-xs md:text-sm mt-2">
          Log in to access your saved addresses, cart, and orders.
        </p>
      </div>

      {messageParam === "password_updated" && (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-800/40 text-emerald-400 text-xs text-center flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>Password updated successfully. Please log in with your new credentials.</span>
        </div>
      )}

      {state?.error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-5 p-3.5 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs text-center flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="redirect" value={redirectParam} />

        <Input
          label="Email Address"
          id="email"
          name="email"
          type="email"
          placeholder="name@example.com"
          required
        />

        <div className="relative">
          <Input
            label="Password"
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-8 text-neutral-400 hover:text-white text-xs cursor-pointer select-none rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] transition-colors"
          >
            Forgot Password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? "Logging in..." : "Log In"}
        </Button>
      </form>

      <div className="text-center text-xs text-neutral-400 mt-6 pt-6 border-t border-dark-border">
        Don&apos;t have an account?{" "}
        <Link
          href={redirectParam !== "/profile" ? `/register?redirect=${encodeURIComponent(redirectParam)}` : "/register"}
          className="text-[var(--color-primary-gold)] font-semibold hover:text-[var(--color-accent-gold)] transition-colors"
        >
          Create Account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-dark-bg text-white">
      <Navbar />

      <main id="main-content" className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <Suspense fallback={<div className="text-center py-12 text-neutral-500">Loading login form...</div>}>
            <LoginForm />
          </Suspense>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
