import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerPayments } from "@/lib/commerce/payments";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AccountPaymentsClient } from "./AccountPaymentsClient";

export const dynamic = "force-dynamic";

export default async function AccountPaymentsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/account/payments");
  }

  const payments = await getCustomerPayments();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <AccountPaymentsClient payments={payments} />
      </main>
      <Footer />
    </div>
  );
}

