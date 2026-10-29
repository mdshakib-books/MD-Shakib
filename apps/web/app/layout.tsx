import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

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
        {children}
      </body>
    </html>
  );
}

