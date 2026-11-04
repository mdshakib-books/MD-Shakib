"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/ui/Modal";
import { useCart } from "@/lib/commerce/cart-context";
import { createClient } from "@/lib/supabase/client";

export interface NavbarProps {
  cartCount?: number;
  user?: {
    name?: string;
    email?: string;
    role?: "user" | "admin";
  } | null;
  onLogout?: () => void;
}

export function Navbar({ cartCount: explicitCartCount, user: explicitUser, onLogout }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const cartContext = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [clientUser, setClientUser] = useState<NavbarProps["user"]>(explicitUser ?? null);
  const navbarRef = useRef<HTMLElement>(null);

  const effectiveCartCount = explicitCartCount !== undefined ? explicitCartCount : cartContext.itemCount;
  const effectiveUser = explicitUser !== undefined ? explicitUser : clientUser;

  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  useEffect(() => {
    if (explicitUser !== undefined) {
      return;
    }

    const supabase = createClient();

    const syncUser = async (user: any) => {
      if (!user) {
        setClientUser(null);
        return;
      }
      let role = (user.user_metadata?.role as "user" | "admin") || "user";
      let name = user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split("@")[0];

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, role")
          .eq("id", user.id)
          .single();
        if (profile) {
          if (profile.role) role = profile.role as "user" | "admin";
          if (profile.name) name = profile.name;
        }
      } catch {
        // preserve fallback
      }

      setClientUser({
        name,
        email: user.email,
        role,
      });
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      syncUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUser(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [explicitUser]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogoutConfirm = async () => {
    setShowLogoutModal(false);
    if (onLogout) {
      onLogout();
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    setClientUser(null);
    router.refresh();
    router.push("/");
  };

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
          ? "bg-[#0E0E0E]/95 border-b border-[#2A2A2A] shadow-luxury backdrop-blur-md"
          : "bg-transparent border-transparent text-white"
      }`
    : "sticky top-0 z-50 transition-all duration-300 bg-[#0E0E0E]/95 border-b border-[#2A2A2A] shadow-luxury backdrop-blur-md";

  return (
    <>
      <nav ref={navbarRef} className={navClasses}>
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between">
          {/* Mobile Hamburger Menu */}
          <button
            className="md:hidden text-[#C9A24A] hover:text-[#E5C87B] p-1.5 rounded-lg hover:bg-white/5 transition-colors focus:outline-none cursor-pointer"
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
            className="font-serif text-xl md:text-2xl font-bold tracking-wider text-[#C9A24A] hover:text-[#E5C87B] transition-colors uppercase select-none"
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
                  className={`text-xs uppercase tracking-widest font-semibold transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] py-1 ${
                    isActive
                      ? "text-[#C9A24A] border-b-2 border-[#C9A24A]"
                      : "text-neutral-300 hover:text-[#C9A24A]"
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
              className="hover:text-[#C9A24A] transition-all duration-[var(--duration-micro)] active:scale-90 p-1.5 rounded-full hover:bg-white/5"
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
                  strokeWidth="1.75"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </Link>

            {/* Cart Icon */}
            <Link
              href="/cart"
              className="relative hover:text-[#C9A24A] transition-all duration-[var(--duration-micro)] active:scale-90 p-1.5 rounded-full hover:bg-white/5"
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
                  strokeWidth="1.75"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>

              {effectiveCartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#C9A24A] text-black text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm animate-pop">
                  {effectiveCartCount > 9 ? "9+" : effectiveCartCount}
                </span>
              )}
            </Link>

            {/* Profile / Auth */}
            {effectiveUser ? (
              <div className="flex items-center gap-3">
                <Link
                  href={effectiveUser.role === "admin" ? "/admin" : "/account"}
                  className="text-xs uppercase tracking-wider font-semibold text-[#C9A24A] hover:underline transition-colors"
                >
                  {effectiveUser.name || "Account"}
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
                className="text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg bg-[#C9A24A] text-black hover:bg-[#B89139] hover:shadow-[0_4px_16px_rgba(201,162,74,0.25)] transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 shadow-sm"
              >
                Log In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-[#111111] border-t border-[#2A2A2A] absolute w-full left-0 z-50 shadow-2xl animate-slide-down">
            <div className="px-4 pt-3 pb-5 space-y-1.5">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                    pathname === link.path
                      ? "text-[#C9A24A] bg-[#1A1A1A] font-semibold"
                      : "text-neutral-300 hover:bg-[#1A1A1A] hover:text-[#C9A24A]"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              {effectiveUser ? (
                <button
                  onClick={() => {
                    setShowLogoutModal(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2.5 rounded-lg font-medium text-sm text-red-400 hover:bg-[#1A1A1A]"
                >
                  Log Out
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2.5 rounded-lg font-semibold text-sm text-[#C9A24A] hover:bg-[#1A1A1A]"
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
        onConfirm={handleLogoutConfirm}
        title="Confirm Logout"
        description="Are you sure you want to log out of your account?"
        confirmText="Logout"
        isDestructive
      />
    </>
  );
}
