"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AccountNavProps {
  className?: string;
}

const NAV_ITEMS = [
  { label: "Overview", href: "/account", aliases: ["/account"] },
  { label: "My Profile", href: "/account/profile", aliases: ["/profile", "/account/profile"] },
  { label: "My Addresses", href: "/account/addresses", aliases: ["/addresses", "/account/addresses"] },
  { label: "My Orders", href: "/account/orders", aliases: ["/orders", "/account/orders"] },
  { label: "Payments", href: "/account/payments", aliases: ["/account/payments"] },
  { label: "Refunds", href: "/account/refunds", aliases: ["/account/refunds"] },
  { label: "Replacements", href: "/account/replacements", aliases: ["/account/replacements"] },
  { label: "Account Security", href: "/account/security", aliases: ["/account/security"] },
];

export function AccountNav({ className = "" }: AccountNavProps) {
  const pathname = usePathname();

  const isItemActive = (item: (typeof NAV_ITEMS)[0]) => {
    if (item.href === "/account") {
      return pathname === "/account";
    }
    return item.aliases.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
  };

  return (
    <nav
      className={`border-b border-[#262626] bg-[#111111]/80 backdrop-blur-md rounded-xl p-2 mb-8 ${className}`}
      aria-label="Customer Account Navigation"
    >
      <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none py-1">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-all duration-200 ${
                active
                  ? "bg-[var(--color-primary-gold)] text-black shadow-md font-bold"
                  : "text-neutral-400 hover:text-white hover:bg-[#1C1C1C]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

