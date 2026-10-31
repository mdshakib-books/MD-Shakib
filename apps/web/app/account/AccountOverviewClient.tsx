"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { formatPrice } from "@/lib/utils";
import type { CustomerAccountOverview } from "@/lib/commerce/account";

interface AccountOverviewClientProps {
  overview: CustomerAccountOverview;
}

export function AccountOverviewClient({ overview }: AccountOverviewClientProps) {
  const { profile, totalOrders, activeOrders, savedAddressesCount, defaultAddress, recentOrders, activeReplacementsCount } =
    overview;

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
          <span className="px-2.5 py-1 rounded bg-[#1C1C1C] border border-[#2E2E2E] text-neutral-300 font-mono">
            ID: {profile.id.slice(0, 8)}...
          </span>
          <span className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-medium">
            Active Account
          </span>
        </div>
      </div>

      {/* Account Navigation Tabs */}
      <AccountNav />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block">
            Total Orders
          </span>
          <span className="font-serif text-2xl md:text-3xl text-neutral-100 font-bold mt-2 block">
            {totalOrders}
          </span>
          <Link href="/account/orders" className="text-[11px] text-[var(--color-primary-gold)] hover:underline mt-2 inline-block">
            View history →
          </Link>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block">
            Active Orders
          </span>
          <span className="font-serif text-2xl md:text-3xl text-emerald-400 font-bold mt-2 block">
            {activeOrders}
          </span>
          <span className="text-[11px] text-neutral-500 mt-2 block">
            Processing & In Transit
          </span>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block">
            Saved Addresses
          </span>
          <span className="font-serif text-2xl md:text-3xl text-neutral-100 font-bold mt-2 block">
            {savedAddressesCount}
          </span>
          <Link href="/account/addresses" className="text-[11px] text-[var(--color-primary-gold)] hover:underline mt-2 inline-block">
            Manage destinations →
          </Link>
        </div>

        <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block">
            Replacements
          </span>
          <span className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] font-bold mt-2 block">
            {activeReplacementsCount}
          </span>
          <Link href="/account/replacements" className="text-[11px] text-[var(--color-primary-gold)] hover:underline mt-2 inline-block">
            View requests →
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Cols: Recent Orders */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#222]">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-200">
              Recent Orders
            </h2>
            <Link
              href="/account/orders"
              className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:underline font-semibold"
            >
              All Orders ({totalOrders}) →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-12 px-4 bg-[#141414] border border-[#222] rounded-xl">
              <p className="text-neutral-400 font-serif text-base">No orders placed yet</p>
              <p className="text-xs text-neutral-500 mt-1 mb-4">
                Explore our collection of authentic Quran, Hadith, and Islamic scholarship.
              </p>
              <Link
                href="/books"
                className="inline-block px-4 py-2 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-xs hover:bg-[var(--color-accent-gold)] transition shadow"
              >
                Explore Books
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[#141414] border border-[#262626] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#383838] transition"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-neutral-200 font-bold">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-medium ${getStatusBadge(
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
                      })} • Payment: {order.payment_method} ({order.payment_status})
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className="font-mono text-xs font-bold text-[var(--color-primary-gold)]">
                      {formatPrice(Number(order.total_amount))}
                    </span>
                    <Link
                      href={`/orders/${order.id}`}
                      className="px-3 py-1.5 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-neutral-200 transition"
                    >
                      Details →
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
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#222] mb-3">
              <h2 className="font-semibold text-neutral-300 uppercase tracking-wider">
                Personal Info
              </h2>
              <Link href="/account/profile" className="text-[11px] text-[var(--color-primary-gold)] hover:underline">
                Edit
              </Link>
            </div>
            <div className="space-y-2 text-neutral-400">
              <p>
                <span className="text-neutral-500 block text-[10px] uppercase">Name</span>
                <strong className="text-neutral-200 text-sm">{profile.name}</strong>
              </p>
              <p>
                <span className="text-neutral-500 block text-[10px] uppercase">Email</span>
                <span className="text-neutral-300">{profile.email}</span>
              </p>
              <p>
                <span className="text-neutral-500 block text-[10px] uppercase">Mobile Phone</span>
                <span className="text-neutral-300">{profile.phone || "Not provided"}</span>
              </p>
            </div>
          </div>

          {/* Default Address Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#222] mb-3">
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
                  <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--color-primary-gold)] text-black font-bold">
                    Default
                  </span>
                </div>
                <p>{defaultAddress.house_no}, {defaultAddress.area}</p>
                {defaultAddress.landmark && <p>Near {defaultAddress.landmark}</p>}
                <p>{defaultAddress.city}, {defaultAddress.state} - {defaultAddress.pincode}</p>
                <p className="pt-1 text-neutral-500">Phone: {defaultAddress.phone}</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-neutral-500">No default address set.</p>
                <Link
                  href="/account/addresses"
                  className="text-xs text-[var(--color-primary-gold)] hover:underline mt-2 inline-block"
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

