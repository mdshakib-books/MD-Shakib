import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerProfile } from "@/lib/auth/session";
import { AccountSecurityClient } from "./AccountSecurityClient";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const profile = await getCustomerProfile();
  if (!profile) {
    redirect("/login?redirect=/account/security");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <AccountSecurityClient profile={profile} />
      </main>
      <Footer />
    </div>
  );
}

