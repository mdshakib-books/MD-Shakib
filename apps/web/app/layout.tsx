import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/lib/commerce/cart-context";
import "./globals.css";

const cinzel = {
  variable: "font-cinzel",
};

const inter = {
  variable: "font-inter",
};

export const metadata: Metadata = {
  title: "MD Shakib | Islamic Book Store",
  description:
    "Explore authentic Islamic books, Quran editions, Hadith collections, and classical scholarly works at MD Shakib Islamic Books.",
  keywords: [
    "Islamic Books",
    "Quran",
    "Hadith",
    "Islamic Bookstore",
    "Authentic Islamic Literature",
  ],
};

export const viewport: Viewport = {
  themeColor: "#0B0B0B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable}`}>
      <body className="bg-[#0B0B0B] text-[#F5F5F5] antialiased selection:bg-[#C9A24A] selection:text-black min-h-screen flex flex-col">
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}

