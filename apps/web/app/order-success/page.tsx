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
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-8 md:p-12 shadow-2xl max-w-lg mx-auto text-center animate-fade-in-up">
            {/* Celebration Icon */}
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-pop">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="font-serif text-2xl md:text-3xl font-bold uppercase tracking-wide text-[#C9A24A] mb-2">
              Order Confirmed!
            </h1>

            <p className="text-neutral-400 text-xs md:text-sm leading-relaxed mb-8 font-light">
              JazakAllah Khair! Your authentic Islamic books order has been successfully placed and recorded.
            </p>

            {/* Order Metadata Card */}
            <div className="bg-[#1C1C1C] border border-[#282828] rounded-xl p-5 mb-8 text-left space-y-3">
              <div className="flex justify-between items-center text-xs border-b border-[#282828] pb-2.5">
                <span className="text-neutral-400 font-light">Order Number:</span>
                <span className="font-mono text-[#C9A24A] font-bold truncate max-w-[200px]" title={order?.order_number || orderId}>
                  #{order?.order_number || orderId.slice(0, 8).toUpperCase()}
                </span>
              </div>

              {order && (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400 font-light">Payment Method:</span>
                    <span className="text-neutral-200 font-semibold">{order.payment_method}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400 font-light">Total Amount:</span>
                    <span className="text-[#C9A24A] font-bold font-mono">
                      {formatPrice(Number(order.total_amount))}
                    </span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400 font-light">Estimated Delivery:</span>
                <span className="text-neutral-200 font-medium">3 – 5 Business Days</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Link href={`/orders/${orderId}`} className="block w-full">
                <Button variant="primary" className="w-full uppercase tracking-wider text-xs font-bold">
                  Track Your Order
                </Button>
              </Link>

              <Link href="/books" className="block w-full">
                <Button variant="secondary" className="w-full uppercase tracking-wider text-xs">
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
