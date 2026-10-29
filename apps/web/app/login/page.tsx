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
    <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8 md:p-10 shadow-2xl max-w-md mx-auto">
      <div className="text-center mb-8">
        <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)]">
          Welcome Back
        </h1>
        <p className="text-neutral-400 text-xs md:text-sm mt-2">
          Log in to access your saved addresses, cart, and orders.
        </p>
      </div>

      {messageParam === "password_updated" && (
        <div className="mb-5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center">
          ✓ Password updated successfully. Please log in with your new credentials.
        </div>
      )}

      {state?.error && (
        <div className="mb-5 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs text-center">
          {state.error}
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
            className="absolute right-3 top-8 text-neutral-400 hover:text-white text-xs cursor-pointer"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-xs text-[#C9A24A] hover:underline"
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

      <div className="text-center text-xs text-neutral-400 mt-6 pt-6 border-t border-[#2A2A2A]">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-[#C9A24A] font-semibold hover:underline">
          Create Account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
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
