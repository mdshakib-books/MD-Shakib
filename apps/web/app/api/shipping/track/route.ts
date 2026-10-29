import { NextResponse } from "next/server";
import { trackShipment } from "@/lib/integrations/delhivery/service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb");

    if (!awb) {
      return NextResponse.json(
        { error: "Query parameter 'awb' is required." },
        { status: 400 }
      );
    }

    const result = await trackShipment(awb);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to track shipment." },
      { status: 400 }
    );
  }
}

