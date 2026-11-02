"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPrice } from "@/lib/utils";
import type { CustomerAccountOverview } from "@/lib/commerce/account";

interface AccountOverviewClientProps {
  overview: CustomerAccountOverview;
}

export function AccountOverviewClient({ overview }: AccountOverviewClientProps) {
  const { profile, totalOrders, activeOrders, savedAddressesCount, defaultAddress, recentOrders, activeReplacementsCount } =
    overview;

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "Delivered":
        return <Badge variant="success">Delivered</Badge>;
      case "Cancelled":
        return <Badge variant="danger">Cancelled</Badge>;
      case "Shipped":
      case "Out for Delivery":
        return <Badge variant="info">{status}</Badge>;
      case "Processing":
      case "Pending":
      default:
        return <Badge variant="warning">{status}</Badge>;
    }
  };

  return (
    <PageContainer size="lg">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Account Dashboard
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Welcome back, <strong className="text-neutral-200">{profile.name}</strong>. Manage your Islamic literature orders and profile.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className="px-2.5 py-1 rounded bg-dark-card border border-dark-border text-neutral-300 font-mono">
            ID: {profile.id.slice(0, 8)}...
          </span>
          <Badge variant="success">Active Account</Badge>
        </div>
      </div>

      {/* Account Navigation Tabs */}
      <AccountNav />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-[var(--color-primary-gold)]/40 transition-colors shadow-luxury">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
            Total Orders
          </span>
          <span className="font-serif text-2xl md:text-3xl text-neutral-100 font-bold mt-2 block">
            {totalOrders}
          </span>
          <Link href="/account/orders" className="text-[11px] text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] mt-2 inline-flex items-center gap-1 font-medium">
            View history &rarr;
          </Link>
        </div>

        <div className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-[var(--color-primary-gold)]/40 transition-colors shadow-luxury">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
            Active Orders
          </span>
          <span className="font-serif text-2xl md:text-3xl text-emerald-400 font-bold mt-2 block">
            {activeOrders}
          </span>
          <span className="text-[11px] text-neutral-500 mt-2 block">
            Processing &amp; In Transit
          </span>
        </div>

        <div className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-[var(--color-primary-gold)]/40 transition-colors shadow-luxury">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
            Saved Addresses
          </span>
          <span className="font-serif text-2xl md:text-3xl text-neutral-100 font-bold mt-2 block">
            {savedAddressesCount}
          </span>
          <Link href="/account/addresses" className="text-[11px] text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] mt-2 inline-flex items-center gap-1 font-medium">
            Manage destinations &rarr;
          </Link>
        </div>

        <div className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-[var(--color-primary-gold)]/40 transition-colors shadow-luxury">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold block">
            Replacements
          </span>
          <span className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] font-bold mt-2 block">
            {activeReplacementsCount}
          </span>
          <Link href="/account/replacements" className="text-[11px] text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] mt-2 inline-flex items-center gap-1 font-medium">
            View requests &rarr;
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Cols: Recent Orders */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-dark-border">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-200">
              Recent Orders
            </h2>
            <Link
              href="/account/orders"
              className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] font-semibold inline-flex items-center gap-1"
            >
              All Orders ({totalOrders}) &rarr;
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <EmptyState
              title="No orders placed yet"
              description="Explore our collection of authentic Quran, Hadith, and Islamic scholarship."
              actionLabel="Explore Books"
              actionHref="/books"
            />
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-dark-surface border border-dark-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-neutral-700 transition shadow-luxury"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-neutral-200 font-bold">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      {renderStatusBadge(order.order_status)}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })} • Payment: {order.payment_method} ({order.payment_status})
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className="font-mono text-xs font-bold text-[var(--color-primary-gold)]">
                      {formatPrice(Number(order.total_amount))}
                    </span>
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="secondary" size="sm">
                        Details &rarr;
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Personal & Address Summary */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-5 text-xs shadow-luxury">
            <div className="flex items-center justify-between pb-2 border-b border-dark-border mb-3">
              <h2 className="font-semibold text-neutral-300 uppercase tracking-wider">
                Personal Info
              </h2>
              <Link href="/account/profile" className="text-[11px] text-[var(--color-primary-gold)] hover:underline">
                Edit
              </Link>
            </div>
            <div className="space-y-2 text-neutral-400">
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase">Name</span>
                <strong className="text-neutral-200 text-sm font-medium">{profile.name}</strong>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase">Email</span>
                <span className="text-neutral-300">{profile.email}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase">Mobile Phone</span>
                <span className="text-neutral-300">{profile.phone || "Not provided"}</span>
              </div>
            </div>
          </div>

          {/* Default Address Card */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-5 text-xs shadow-luxury">
            <div className="flex items-center justify-between pb-2 border-b border-dark-border mb-3">
              <h2 className="font-semibold text-neutral-300 uppercase tracking-wider">
                Primary Shipping Address
              </h2>
              <Link href="/account/addresses" className="text-[11px] text-[var(--color-primary-gold)] hover:underline">
                Manage
              </Link>
            </div>

            {defaultAddress ? (
              <div className="space-y-1 text-neutral-400">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-neutral-200">{defaultAddress.full_name}</span>
                  <Badge variant="gold">Default</Badge>
                </div>
                <p>{defaultAddress.house_no}, {defaultAddress.area}</p>
                {defaultAddress.landmark && <p>Near {defaultAddress.landmark}</p>}
                <p>{defaultAddress.city}, {defaultAddress.state} - {defaultAddress.pincode}</p>
                <p className="pt-1 text-neutral-500 font-mono text-[11px]">Phone: {defaultAddress.phone}</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-neutral-500">No default address set.</p>
                <Link
                  href="/account/addresses"
                  className="text-xs text-[var(--color-primary-gold)] hover:underline mt-2 inline-block font-semibold"
                >
                  + Add Address
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
