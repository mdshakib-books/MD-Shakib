import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerProfile } from "@/lib/auth/session";
import { getCustomerTickets } from "@/lib/support/tickets";
import { AccountSupportClient } from "./AccountSupportClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support Tickets | MD Shakib Islamic Books",
  description: "Customer support ticket center.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AccountSupportPage() {
  const profile = await getCustomerProfile();

  if (!profile) {
    redirect("/login?redirect=/account/support");
  }

  const tickets = await getCustomerTickets(profile.id);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main id="main-content" className="flex-grow py-12 px-4 md:px-6">
        <AccountSupportClient customerId={profile.id} initialTickets={tickets} />
      </main>

      <Footer />
    </div>
  );
}
