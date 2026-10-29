import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRazorpayOrder } from "@/lib/integrations/razorpay/service";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: "Authentication required to initiate payment." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing required parameter: orderId" },
        { status: 400 }
      );
    }

    const result = await createRazorpayOrder(orderId, user.id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API /payments/create-order error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Internal server error creating payment order." },
      { status: 400 }
    );
  }
}

