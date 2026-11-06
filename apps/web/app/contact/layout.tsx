import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | MD Shakib Islamic Books",
  description:
    "Get in touch with MD Shakib Islamic Books for customer support, book recommendations, order tracking, and general inquiries.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact MD Shakib Islamic Books",
    description:
      "Get in touch with MD Shakib Islamic Books for customer support, book recommendations, and inquiries.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}

