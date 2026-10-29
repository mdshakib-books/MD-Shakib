import Razorpay from "razorpay";
import { getIntegrationsConfig } from "../config";

let razorpayInstance: Razorpay | null = null;

/**
 * Returns a server-side singleton Razorpay client instance.
 * Throws an error if Razorpay credentials are not configured.
 */
export function getRazorpayClient(): Razorpay {
  if (typeof window !== "undefined") {
    throw new Error("Razorpay client cannot be initialized in browser context.");
  }

  const { razorpay } = getIntegrationsConfig();

  if (!razorpay.keyId || !razorpay.keySecret) {
    throw new Error("Razorpay credentials are missing (NEXT_PUBLIC_RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).");
  }

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: razorpay.keyId,
      key_secret: razorpay.keySecret,
    });
  }

  return razorpayInstance;
}

