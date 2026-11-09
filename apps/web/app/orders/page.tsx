import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPrice } from "@/lib/utils";
import { getCustomerOrders } from "@/lib/commerce/orders";
import { getAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order History | MD Shakib Islamic Books",
  description: "View and track your previous book orders.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrdersPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/orders");
  }

  const orders = await getCustomerOrders();

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Delivered":
      case "Replacement Delivered":
        return "success";
      case "Cancelled":
      case "Replacement Rejected":
        return "danger";
      case "Shipped":
      case "Out for Delivery":
        return "info";
      case "Confirmed":
      case "Processing":
      case "Packed":
        return "gold";
      default:
        return "muted";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main id="main-content" className="flex-grow py-12 px-4 md:px-6">
        <PageContainer size="md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="font-serif text-2xl md:text-3xl text-[#C9A24A] uppercase font-bold tracking-wide">
                My Orders
              </h1>
              <p className="text-xs text-neutral-400 mt-1 font-light">
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
            <EmptyState
              title="No Orders Yet"
              description="You have not placed any orders yet. Discover our collection of authentic Quran editions, Hadith collections, and scholarly works."
              icon={
                <svg className="w-8 h-8 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              actionText="Start Shopping"
              actionUrl="/books"
            />
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[#141414] border border-[#262626] rounded-xl p-5 hover:border-[#383838] transition-all shadow-luxury"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222222] pb-4">
                    <div>
                      <div className="flex items-center space-x-3">
                        <span className="font-mono text-xs text-neutral-200 font-bold">
                          Order #{order.order_number || order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <Badge variant={getStatusBadgeVariant(order.order_status)}>
                          {order.order_status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 font-light">
                        Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-neutral-400 font-light block">Total Amount</span>
                      <span className="text-[#C9A24A] font-bold font-mono text-sm">
                        {formatPrice(Number(order.total_amount))}
                      </span>
                    </div>
                  </div>

                  {/* Order Items Preview (if present) */}
                  {Array.isArray((order as any).items) && (order as any).items.length > 0 && (
                    <div className="py-4 space-y-2">
                      {(order as any).items.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-center text-xs">
                          <span className="text-neutral-300 truncate max-w-sm font-light">
                            {item.quantity}x {item.title}
                          </span>
                          <span className="text-neutral-400 font-mono">
                            {formatPrice(Number(item.price) * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-[#222222] pt-4 flex justify-between items-center text-xs">
                    <span className="text-neutral-500 text-[11px] font-mono">
                      Payment: {order.payment_method} ({order.payment_status})
                    </span>
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-xs font-semibold uppercase tracking-wider text-[#C9A24A] hover:underline"
                    >
                      View Details &amp; Track →
                    </Link>
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
