import * as React from "react";
import { notFound, redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerOrderById } from "@/lib/commerce/orders";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { OrderDetailClient } from "./OrderDetailClient";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const order = await getCustomerOrderById(id);

  if (!order) {
    notFound();
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <OrderDetailClient order={order} />
      </main>
      <Footer />
    </div>
  );
}
