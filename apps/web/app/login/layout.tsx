import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Login | MD Shakib Islamic Books",
  description: "Sign in to your MD Shakib Islamic Books account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

