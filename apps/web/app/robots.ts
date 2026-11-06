import { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/auth/session";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getCanonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/books",
          "/books/*",
          "/about",
          "/contact",
          "/terms",
          "/privacy-policy",
        ],
        disallow: [
          "/admin",
          "/admin/*",
          "/api",
          "/api/*",
          "/account",
          "/account/*",
          "/checkout",
          "/checkout/*",
          "/cart",
          "/orders",
          "/orders/*",
          "/profile",
          "/addresses",
          "/reset-password",
          "/forgot-password",
          "/verify-email",
          "/verify-otp",
          "/verify-registration-otp",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

