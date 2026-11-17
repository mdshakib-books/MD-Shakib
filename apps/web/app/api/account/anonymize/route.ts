import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anonymizeCustomerAccount } from "@/lib/commerce/account";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`account:anonymize:${user.id}`, "auth");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { confirmation } = parsedBody.data;
    if (confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        { error: 'Confirmation string must exactly match "DELETE MY ACCOUNT".' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await anonymizeCustomerAccount(user.id);
    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json(
      { success: true, message: "Account successfully anonymized." },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return serverErrorResponse(
      "/api/account/anonymize",
      err,
      "Failed to anonymize account.",
      req
    );
  }
}
