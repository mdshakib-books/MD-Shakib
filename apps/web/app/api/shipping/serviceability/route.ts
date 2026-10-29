import { NextResponse } from "next/server";
import { checkPincodeServiceability } from "@/lib/integrations/delhivery/service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pincode = searchParams.get("pincode");

    if (!pincode) {
      return NextResponse.json(
        { error: "Query parameter 'pincode' is required." },
        { status: 400 }
      );
    }

    const result = await checkPincodeServiceability(pincode);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to check pincode serviceability." },
      { status: 400 }
    );
  }
}

