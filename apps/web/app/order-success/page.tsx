import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { getCustomerOrderById } from "@/lib/commerce/orders";
import { getAuthenticatedUser } from "@/lib/auth/session";

interface OrderSuccessPageProps {
  searchParams: Promise<{ orderId?: string }>;
}

export const dynamic = "force-dynamic";

export default async function OrderSuccessPage({ searchParams }: OrderSuccessPageProps) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const { orderId } = await searchParams;
  if (!orderId) {
    redirect("/orders");
  }

  const order = await getCustomerOrderById(orderId);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <PageContainer size="sm">
          <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8 md:p-12 shadow-2xl max-w-lg mx-auto text-center">
            {/* Celebration Icon */}
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center text-4xl mx-auto mb-6">
              ✓
            </div>

            <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase text-[var(--color-primary-gold)] mb-2">
              Order Confirmed!
            </h1>

            <p className="text-neutral-400 text-xs md:text-sm leading-relaxed mb-6">
              JazakAllah Khair! Your authentic Islamic books order has been successfully placed.
            </p>

            {/* Order Metadata Card */}
            <div className="bg-[#161616] border border-[#262626] rounded-xl p-5 mb-8 text-left space-y-3">
              <div className="flex justify-between items-center text-xs border-b border-[#262626] pb-2">
                <span className="text-neutral-400">Order ID:</span>
                <span className="font-mono text-neutral-200 truncate max-w-[200px]" title={orderId}>
                  {orderId}
                </span>
              </div>

              {order && (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">Payment Method:</span>
                    <span className="text-neutral-200 font-semibold">{order.payment_method}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">Total Amount:</span>
                    <span className="text-[var(--color-primary-gold)] font-bold font-mono">
                      {formatPrice(Number(order.total_amount))}
                    </span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">Estimated Delivery:</span>
                <span className="text-neutral-200">3 - 5 Business Days</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Link href={`/orders/${orderId}`} className="block w-full">
                <Button variant="primary" className="w-full">
                  Track Your Order
                </Button>
              </Link>

              <Link href="/books" className="block w-full">
                <button className="w-full py-2.5 rounded-lg border border-[#333] text-neutral-300 hover:text-white hover:border-[#555] text-xs font-semibold transition cursor-pointer">
                  Continue Shopping
                </button>
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
