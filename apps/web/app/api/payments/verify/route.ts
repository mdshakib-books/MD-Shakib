import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndSettlePayment } from "@/lib/integrations/razorpay/service";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: "Authentication required to verify payment." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required Razorpay payment signature parameters." },
        { status: 400 }
      );
    }

    const result = await verifyAndSettlePayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API /payments/verify error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Payment signature verification failed." },
      { status: 400 }
    );
  }
}

