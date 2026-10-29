import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/integrations/razorpay/webhook";

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing x-razorpay-signature header" },
        { status: 400 }
      );
    }

    const rawBody = await req.text();
    const result = await processRazorpayWebhook(rawBody, signature);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Razorpay webhook error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Webhook processing failed" },
      { status: 400 }
    );
  }
}

