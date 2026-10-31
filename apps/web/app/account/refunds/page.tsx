import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerRefunds } from "@/lib/commerce/payments";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AccountRefundsClient } from "./AccountRefundsClient";

export const dynamic = "force-dynamic";

export default async function AccountRefundsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/account/refunds");
  }

  const refunds = await getCustomerRefunds();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <AccountRefundsClient refunds={refunds} />
      </main>
      <Footer />
    </div>
  );
}

