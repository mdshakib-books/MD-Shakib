"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConfirmModal } from "@/components/ui/Modal";

export interface NavbarProps {
  cartCount?: number;
  user?: {
    name?: string;
    email?: string;
    role?: "user" | "admin";
  } | null;
  onLogout?: () => void;
}

export function Navbar({ cartCount = 0, user = null, onLogout }: NavbarProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const navbarRef = useRef<HTMLElement>(null);

  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Books", path: "/books" },
    { name: "About", path: "/about" },
    { name: "Support", path: "/support" },
  ];

  const isHomePage = pathname === "/";

  const navClasses = isHomePage
    ? `fixed w-full top-0 left-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#111111] border-b border-[#2A2A2A] shadow-lg backdrop-blur-md"
          : "bg-transparent border-transparent text-white"
      }`
    : "sticky top-0 z-50 transition-all duration-300 bg-[#111111] border-b border-[#2A2A2A] shadow-lg";

  return (
    <>
      <nav ref={navbarRef} className={navClasses}>
        <div className="max-w-[1200px] mx-auto px-6 h-[72px] flex items-center justify-between">
          {/* Mobile Hamburger Menu */}
          <button
            className="md:hidden text-[var(--color-primary-gold)] focus:outline-none cursor-pointer"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          {/* Brand Logo */}
          <Link
            href="/"
            className="font-serif text-xl md:text-2xl font-bold tracking-wider text-[var(--color-primary-gold)] uppercase"
          >
            MD SHAKIB
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => {
              const isActive = pathname === link.path;
              return (
                <Link
                  key={link.name}
                  href={link.path}
                  className={`text-sm font-medium transition-colors ${
                    isActive
                      ? "text-[var(--color-primary-gold)] border-b-2 border-[var(--color-primary-gold)] pb-1"
                      : "text-neutral-300 hover:text-[var(--color-primary-gold)]"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </div>

          {/* Right Action Icons (Search, Cart, Auth) */}
          <div className="flex items-center space-x-5 text-neutral-300">
            {/* Search Link */}
            <Link
              href="/books"
              className="hover:text-[var(--color-accent-gold)] transition-colors"
              title="Search"
              aria-label="Search Books"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </Link>

            {/* Cart Icon */}
            <Link
              href="/cart"
              className="relative hover:text-[var(--color-accent-gold)] transition-colors"
              title="Cart"
              aria-label="Shopping Cart"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>

              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-[var(--color-primary-gold)] text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>

            {/* Profile / Auth */}
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  href={user.role === "admin" ? "/admin/dashboard" : "/profile"}
                  className="text-xs uppercase font-medium text-[var(--color-primary-gold)] hover:underline"
                >
                  {user.name || "Account"}
                </Link>
                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  className="text-xs text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-xs font-semibold uppercase px-4 py-2 rounded-lg bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)] transition-colors"
              >
                Log In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-[#111111] border-t border-[#2A2A2A] absolute w-full left-0 z-50">
            <div className="px-4 pt-2 pb-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md font-medium text-sm ${
                    pathname === link.path
                      ? "text-[var(--color-primary-gold)] bg-[#1a1a1a]"
                      : "text-neutral-200 hover:bg-[#1a1a1a] hover:text-[var(--color-primary-gold)]"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              {user ? (
                <button
                  onClick={() => {
                    setShowLogoutModal(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 rounded-md font-medium text-sm text-red-500 hover:bg-[#1a1a1a]"
                >
                  Log Out
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md font-medium text-sm text-[var(--color-primary-gold)] hover:bg-[#1a1a1a]"
                >
                  Log In
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={() => onLogout?.()}
        title="Confirm Logout"
        description="Are you sure you want to log out of your account?"
        confirmText="Logout"
        isDestructive
      />
    </>
  );
}
