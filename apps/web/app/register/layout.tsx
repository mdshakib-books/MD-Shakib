import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account | MD Shakib Islamic Books",
  description: "Register for an MD Shakib Islamic Books customer account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

