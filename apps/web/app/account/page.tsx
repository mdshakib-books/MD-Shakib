import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerAccountOverview } from "@/lib/commerce/account";
import { AccountOverviewClient } from "./AccountOverviewClient";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const overview = await getCustomerAccountOverview();

  if (!overview) {
    redirect("/login?redirect=/account");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow py-12 px-4 md:px-6">
        <AccountOverviewClient overview={overview} />
      </main>

      <Footer />
    </div>
  );
}

