"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface AdminNavClientProps {
  adminName: string;
  adminEmail: string;
}

export function AdminNavClient({ adminName, adminEmail }: AdminNavClientProps) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navLinks = [
    {
      name: "Dashboard",
      href: "/admin",
      exact: true,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: "Orders",
      href: "/admin/orders",
      exact: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      name: "Books",
      href: "/admin/books",
      exact: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: "Customers",
      href: "/admin/users",
      exact: false,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Top Mobile Bar */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#111111] border-b border-[#2A2A2A] text-white sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-gray-300 hover:text-white"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <span className="font-bold text-sm tracking-wide text-[var(--color-primary-gold,#C9A24A)]">
            Admin Portal
          </span>
        </div>
        <Link
          href="/"
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition"
        >
          <span>Storefront</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </header>

      {/* Sidebar for Desktop / Overlay for Mobile */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-[#111111] border-r border-[#2A2A2A] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-[#2A2A2A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-600/30 flex items-center justify-center text-[var(--color-primary-gold,#C9A24A)] font-serif font-bold text-lg">
              MS
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">MD Shakib Books</h2>
              <p className="text-[11px] text-[var(--color-primary-gold,#C9A24A)] uppercase tracking-wider font-semibold">
                Admin Portal
              </p>
            </div>
          </div>
          {isMobileOpen && (
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-[#1A1A1A] text-[var(--color-primary-gold,#C9A24A)] border border-[var(--color-primary-gold,#C9A24A)]/30 shadow-inner"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#161616]"
                )}
              >
                <span className={cn(isActive ? "text-[var(--color-primary-gold,#C9A24A)]" : "text-gray-500")}>
                  {link.icon}
                </span>
                <span>{link.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Identity & Storefront Link */}
        <div className="p-4 border-t border-[#2A2A2A] bg-[#0E0E0E]">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-2 mb-3 text-xs font-medium text-gray-300 hover:text-white bg-[#1A1A1A] hover:bg-[#222222] border border-[#2A2A2A] rounded-lg transition"
          >
            <span>Exit to Storefront</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>

          <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-[#141414] border border-[#222222]">
            <div className="w-8 h-8 rounded-full bg-emerald-900 text-emerald-200 flex items-center justify-center font-bold text-xs uppercase">
              {adminName ? adminName.charAt(0) : "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{adminName || "Admin"}</p>
              <p className="text-[10px] text-gray-400 truncate">{adminEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
        />
      )}
    </>
  );
}

