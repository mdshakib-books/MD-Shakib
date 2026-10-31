import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerAddresses } from "@/lib/commerce/addresses";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AddressesClient } from "@/app/addresses/AddressesClient";

export const dynamic = "force-dynamic";

export default async function AccountAddressesPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/account/addresses");
  }

  const addresses = await getCustomerAddresses();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <AddressesClient initialAddresses={addresses} />
      </main>
      <Footer />
    </div>
  );
}

