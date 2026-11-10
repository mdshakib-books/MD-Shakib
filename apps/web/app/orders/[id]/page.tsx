import * as React from "react";
import { notFound, redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerOrderById } from "@/lib/commerce/orders";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const { data: returnRequest } = await supabase
    .from("return_requests")
    .select("id, return_number, request_type, reason, description, status, rejection_reason, admin_notes, pickup_awb, refund_amount, created_at, updated_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />
      <main className="flex-grow py-12 px-4 md:px-6">
        <OrderDetailClient order={order} initialReturnRequest={returnRequest} />
      </main>
      <Footer />
    </div>
  );
}
