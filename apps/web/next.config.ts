import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const connectSrcOrigins = [
  "'self'",
  "https://*.supabase.co",
  ...(isProduction
    ? []
    : [
        "http://127.0.0.1:54321",
        "http://localhost:54321",
        "ws://127.0.0.1:54321",
        "ws://localhost:54321",
      ]),
  "https://api.razorpay.com",
  "https://lumberjack.razorpay.com",
  "https://res.cloudinary.com",
  "https://lottie.host",
];

// Next.js static/ISR pages rely on inline hydration scripts when dynamic per-request nonces
// are not used; strip 'unsafe-eval' in production while scoping 'wasm-unsafe-eval' for self-hosted dotlottie WASM.
const scriptSrcDirectives = [
  "'self'",
  "'unsafe-inline'",
  ...(isProduction ? [] : ["'unsafe-eval'"]),
  "'wasm-unsafe-eval'",
  "https://checkout.razorpay.com",
];

// Authoritative Content Security Policy built specifically for MD Shakib Islamic Books
const cspHeader = [
  "default-src 'self'",
  `script-src ${scriptSrcDirectives.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://checkout.razorpay.com",
  "font-src 'self' data:",
  `connect-src ${connectSrcOrigins.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
]
  .join("; ")
  .trim();

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspHeader,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.razorpay.com\")",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
    ],
  },
  devIndicators: {
    position: 'bottom-right',
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
