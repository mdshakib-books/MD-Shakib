import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerReplacements } from "@/lib/commerce/orders";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AccountReplacementsClient } from "./AccountReplacementsClient";

export const dynamic = "force-dynamic";

export default async function AccountReplacementsPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/account/replacements");
  }

  const replacements = await getCustomerReplacements();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <AccountReplacementsClient replacements={replacements} />
      </main>
      <Footer />
    </div>
  );
}

