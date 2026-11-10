import * as React from "react";
import Link from "next/link";
import { getBusinessDisclosures } from "@/lib/config/business";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const disclosures = getBusinessDisclosures();

  return (
    <footer className="bg-[#0E0E0E] border-t border-[#2A2A2A] pt-14 pb-12 text-center text-[#F5F5F5] mt-auto">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 flex flex-col items-center">
        {/* Logo & Tagline */}
        <div className="mb-6">
          <Link
            href="/"
            className="font-serif text-2xl md:text-3xl font-bold text-[#C9A24A] hover:text-[#E5C87B] tracking-wider uppercase transition-colors"
          >
            MD SHAKIB
          </Link>
          <p className="text-neutral-400 mt-2 text-xs sm:text-sm font-light tracking-wide">
            Authentic Islamic Bookstore &amp; Scholarly Literature
          </p>
        </div>

        {/* Primary Navigation Links */}
        <div className="flex flex-wrap justify-center gap-5 md:gap-7 mb-4">
          <Link
            href="/about"
            className="text-xs uppercase tracking-wider font-semibold text-neutral-300 hover:text-[#C9A24A] transition-colors"
          >
            About
          </Link>
          <Link
            href="/books"
            className="text-xs uppercase tracking-wider font-semibold text-neutral-300 hover:text-[#C9A24A] transition-colors"
          >
            Catalogue
          </Link>
          <Link
            href="/contact"
            className="text-xs uppercase tracking-wider font-semibold text-neutral-300 hover:text-[#C9A24A] transition-colors"
          >
            Contact
          </Link>
          <Link
            href="/support"
            className="text-xs uppercase tracking-wider font-semibold text-neutral-300 hover:text-[#C9A24A] transition-colors"
          >
            Help &amp; Support
          </Link>
        </div>

        {/* Statutory Policy Links */}
        <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-8 text-[11px] text-neutral-400">
          <Link
            href="/shipping-policy"
            className="hover:text-[#C9A24A] transition-colors underline-offset-4 hover:underline"
          >
            Shipping Policy
          </Link>
          <span className="text-neutral-600">•</span>
          <Link
            href="/cancellation-policy"
            className="hover:text-[#C9A24A] transition-colors underline-offset-4 hover:underline"
          >
            Cancellation Policy
          </Link>
          <span className="text-neutral-600">•</span>
          <Link
            href="/returns-policy"
            className="hover:text-[#C9A24A] transition-colors underline-offset-4 hover:underline"
          >
            Return &amp; Refund Policy
          </Link>
          <span className="text-neutral-600">•</span>
          <Link
            href="/privacy-policy"
            className="hover:text-[#C9A24A] transition-colors underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          <span className="text-neutral-600">•</span>
          <Link
            href="/terms"
            className="hover:text-[#C9A24A] transition-colors underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>
        </div>

        {/* Legal & Grievance Disclosures */}
        <div className="w-full max-w-2xl border-t border-[#222222] pt-5 pb-6 text-[11px] text-neutral-500 space-y-1">
          <p>
            Operating entity: <strong className="text-neutral-400">{disclosures.displayLegalName}</strong>
          </p>
          <p className="text-neutral-400">
            Registered Address: {disclosures.displayAddress}
          </p>
          <p>
            Customer Care:{" "}
            <a href={`mailto:${disclosures.supportEmail}`} className="text-[#C9A24A] hover:underline">
              {disclosures.supportEmail}
            </a>
            {disclosures.displayPhone && (
              <>
                {" "}| Tel:{" "}
                <a href={`tel:${disclosures.displayPhone}`} className="text-[#C9A24A] hover:underline">
                  {disclosures.displayPhone}
                </a>
              </>
            )}
            {" "}| Grievance Redressal:{" "}
            <a href={`mailto:${disclosures.grievanceOfficer.email}`} className="text-[#C9A24A] hover:underline">
              {disclosures.grievanceOfficer.email}
            </a>
          </p>
        </div>

        {/* Copyright */}
        <div className="w-full border-t border-[#2A2A2A] pt-6 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500">
          <p>© {currentYear} {disclosures.displayLegalName}. All rights reserved.</p>
          <p className="mt-2 md:mt-0 opacity-70">
            Dedicated to Classical Islamic Scholarship &amp; Preservation
          </p>
        </div>
      </div>
    </footer>
  );
}
