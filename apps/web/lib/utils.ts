import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with clsx and merges Tailwind classes safely
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats price in Indian Rupees (INR) matching legacy formatPrice.js
 */
export function formatPrice(price: number | null | undefined): string {
  const value = Math.round(price || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Truncates text with ellipsis matching legacy truncateText.js
 */
export function truncateText(text: string | null | undefined, maxLength = 100): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

