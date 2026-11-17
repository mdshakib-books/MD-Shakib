import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupportTicket, getCustomerTickets } from "@/lib/support/tickets";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function GET(req: NextRequest) {
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

    const rl = await checkRateLimit(`support:list:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const tickets = await getCustomerTickets(user.id);
    return NextResponse.json({ tickets }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/support/tickets", err, "Failed to fetch tickets.", req);
  }
}

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

    const rl = await checkRateLimit(`support:create:${user.id}`, "contact");
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

    const { category, subject, description, priority, orderId, attachments } = parsedBody.data;
    if (orderId && !isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await createSupportTicket({
      customerId: user.id,
      category,
      subject,
      description,
      priority,
      orderId,
      attachments,
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(res, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/support/tickets",
      err,
      "Failed to create support ticket.",
      req
    );
  }
}
