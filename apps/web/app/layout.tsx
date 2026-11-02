import type { Metadata, Viewport } from "next";
import { CartProvider } from "@/lib/commerce/cart-context";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import "./globals.css";

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
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className="bg-[#0B0B0B] text-[#F5F5F5] antialiased selection:bg-[#C9A24A] selection:text-black min-h-screen flex flex-col pb-[calc(70px+env(safe-area-inset-bottom,0px))] md:pb-0 relative">
        <CartProvider>
          {children}
          <MobileBottomNav />
        </CartProvider>
      </body>
    </html>
  );
}
