import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { formatPrice } from "@/lib/utils";
import { getCustomerOrders } from "@/lib/commerce/orders";
import { getAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/orders");
  }

  const orders = await getCustomerOrders();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Delivered":
        return "bg-emerald-950/20 text-emerald-400 border-emerald-800/40";
      case "Cancelled":
        return "bg-red-950/20 text-red-400 border-red-800/40";
      case "Shipped":
      case "Out for Delivery":
        return "bg-blue-950/20 text-blue-400 border-blue-800/40";
      case "Processing":
      case "Pending":
      default:
        return "bg-amber-950/20 text-[var(--color-primary-gold)] border-amber-800/40";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow py-12 px-4 md:px-6">
        <PageContainer size="md">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
                My Orders
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                View your historical Islamic literature orders and delivery progress.
              </p>
            </div>

            <Link
              href="/books"
              className="text-xs uppercase tracking-wider text-[#C9A24A] hover:underline font-semibold"
            >
              Browse Catalogue →
            </Link>
          </div>

          <AccountNav />

          {orders.length === 0 ? (
            <div className="text-center py-20 px-4 bg-[#141414] border border-[#222] rounded-xl">
              <div className="text-4xl mb-3">📦</div>
              <h2 className="text-lg font-serif text-neutral-200 uppercase">No orders yet</h2>
              <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6">
                You have not placed any orders yet. Discover our collection of authentic Quran, Hadith, and scholarly works.
              </p>
              <Link
                href="/books"
                className="inline-block px-6 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-xs hover:bg-[var(--color-accent-gold)] transition-all shadow"
              >
                Start Shopping
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[#141414] border border-[#262626] rounded-xl p-5 hover:border-[#383838] transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-xs text-neutral-300 font-bold">
                          Order #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase font-medium ${getStatusBadge(
                            order.order_status
                          )}`}
                        >
                          {order.order_status}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-right">
                        <span className="text-[10px] text-neutral-500 block">Total Amount</span>
                        <span className="text-sm font-bold text-[var(--color-primary-gold)] font-mono">
                          {formatPrice(Number(order.total_amount))}
                        </span>
                      </div>

                      <Link
                        href={`/orders/${order.id}`}
                        className="px-4 py-2 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-neutral-200 transition"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-between text-xs text-neutral-400">
                    <span>Payment: <strong className="text-neutral-300">{order.payment_method}</strong> ({order.payment_status})</span>
                    <span>Status: <strong className="text-neutral-300">{order.order_status}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}
