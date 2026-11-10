import { createAdminClient } from "@/lib/supabase/admin";

export type TicketCategory = "order" | "payment" | "delivery" | "return" | "product" | "general";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  isStaff: boolean;
  message: string;
  attachments: string[];
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  orderId?: string | null;
  orderNumber?: string | null;
  category: TicketCategory;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo?: string | null;
  assignedStaffName?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
}

/**
 * Creates a new customer support ticket with initial message (2.24, 2.27).
 */
export async function createSupportTicket(params: {
  customerId: string;
  category: TicketCategory;
  subject: string;
  description: string;
  priority?: TicketPriority;
  orderId?: string | null;
  attachments?: string[];
}): Promise<{
  success: boolean;
  ticket?: SupportTicket;
  error?: string;
}> {
  const { customerId, category, subject, description, priority = "medium", orderId, attachments = [] } = params;

  if (!subject || !subject.trim()) {
    return { success: false, error: "Subject is required." };
  }
  if (!description || !description.trim()) {
    return { success: false, error: "Description is required." };
  }

  const validCategories: TicketCategory[] = ["order", "payment", "delivery", "return", "product", "general"];
  if (!validCategories.includes(category)) {
    return { success: false, error: `Invalid ticket category: ${category}` };
  }

  const adminDb = createAdminClient();

  // If order_id provided, verify order exists and belongs to customer
  let orderNumber: string | null = null;
  if (orderId) {
    const { data: order, error: ordErr } = await adminDb
      .from("orders")
      .select("id, order_number, user_id")
      .eq("id", orderId)
      .single();

    if (ordErr || !order || order.user_id !== customerId) {
      return { success: false, error: "Invalid order referenced for support ticket." };
    }
    orderNumber = order.order_number;
  }

  // Generate sequence-based ticket number: TCK-YYYYMM-XXXXX
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const ticketNumber = `TCK-${yearMonth}-${randomSuffix}`;

  const { data: ticket, error: ticketErr } = await adminDb
    .from("support_tickets")
    .insert({
      ticket_number: ticketNumber,
      customer_id: customerId,
      order_id: orderId || null,
      category,
      subject: subject.trim(),
      description: description.trim(),
      priority,
      status: "open",
    })
    .select("*, profiles!support_tickets_customer_id_fkey(name, email)")
    .single();

  if (ticketErr || !ticket) {
    return { success: false, error: ticketErr?.message || "Failed to create support ticket." };
  }

  // Insert initial message into ticket_messages
  await adminDb.from("ticket_messages").insert({
    ticket_id: ticket.id,
    sender_id: customerId,
    is_staff: false,
    message: description.trim(),
    attachments,
  });

  return {
    success: true,
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      customerId: ticket.customer_id,
      customerName: (ticket.profiles as any)?.name,
      customerEmail: (ticket.profiles as any)?.email,
      orderId: ticket.order_id,
      orderNumber,
      category: ticket.category as TicketCategory,
      subject: ticket.subject,
      description: ticket.description,
      priority: ticket.priority as TicketPriority,
      status: ticket.status as TicketStatus,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
  };
}

/**
 * Appends a reply message to an existing support ticket (2.24, 2.27).
 */
export async function addTicketMessage(params: {
  ticketId: string;
  senderId: string;
  isStaff: boolean;
  message: string;
  attachments?: string[];
}): Promise<{
  success: boolean;
  message?: TicketMessage;
  error?: string;
}> {
  const { ticketId, senderId, isStaff, message, attachments = [] } = params;

  if (!message || !message.trim()) {
    return { success: false, error: "Message cannot be empty." };
  }

  const adminDb = createAdminClient();

  // Verify ticket exists
  const { data: ticket, error: tErr } = await adminDb
    .from("support_tickets")
    .select("id, status, customer_id")
    .eq("id", ticketId)
    .single();

  if (tErr || !ticket) {
    return { success: false, error: "Support ticket not found." };
  }

  // Customer cannot reply to someone else's ticket
  if (!isStaff && ticket.customer_id !== senderId) {
    return { success: false, error: "Unauthorized access to this ticket." };
  }

  const nowIso = new Date().toISOString();

  // Insert message
  const { data: msg, error: msgErr } = await adminDb
    .from("ticket_messages")
    .insert({
      ticket_id: ticketId,
      sender_id: senderId,
      is_staff: isStaff,
      message: message.trim(),
      attachments,
    })
    .select("*, profiles!ticket_messages_sender_id_fkey(name)")
    .single();

  if (msgErr || !msg) {
    return { success: false, error: msgErr?.message || "Failed to post message." };
  }

  // Update ticket state:
  // Staff reply -> 'waiting_customer' or 'in_progress'
  // Customer reply -> 'in_progress' if resolved/waiting
  let nextStatus = ticket.status;
  if (isStaff) {
    if (ticket.status === "open") nextStatus = "in_progress";
  } else {
    if (ticket.status === "waiting_customer" || ticket.status === "resolved") {
      nextStatus = "in_progress";
    }
  }

  await adminDb
    .from("support_tickets")
    .update({
      status: nextStatus,
      updated_at: nowIso,
    })
    .eq("id", ticketId);

  return {
    success: true,
    message: {
      id: msg.id,
      ticketId: msg.ticket_id,
      senderId: msg.sender_id,
      senderName: (msg.profiles as any)?.name || (isStaff ? "Support Staff" : "Customer"),
      isStaff: msg.is_staff,
      message: msg.message,
      attachments: msg.attachments || [],
      createdAt: msg.created_at,
    },
  };
}

/**
 * Retrieves all support tickets for a given customer (2.24).
 */
export async function getCustomerTickets(customerId: string): Promise<SupportTicket[]> {
  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from("support_tickets")
    .select(`
      id,
      ticket_number,
      customer_id,
      order_id,
      category,
      subject,
      description,
      priority,
      status,
      created_at,
      updated_at,
      orders (order_number)
    `)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];

  return data.map((t: any) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    customerId: t.customer_id,
    orderId: t.order_id,
    orderNumber: t.orders?.order_number || null,
    category: t.category,
    subject: t.subject,
    description: t.description,
    priority: t.priority,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

/**
 * Retrieves ticket details and all message threads (2.24, 2.27).
 */
export async function getTicketDetails(
  ticketId: string,
  requesterId: string,
  isAdmin: boolean = false
): Promise<SupportTicket | null> {
  const adminDb = createAdminClient();

  const { data: ticket, error } = await adminDb
    .from("support_tickets")
    .select(`
      *,
      profiles!support_tickets_customer_id_fkey(name, email),
      orders(order_number)
    `)
    .eq("id", ticketId)
    .single();

  if (error || !ticket) return null;

  if (!isAdmin && ticket.customer_id !== requesterId) {
    return null;
  }

  // Fetch messages thread
  const { data: messages } = await adminDb
    .from("ticket_messages")
    .select("*, profiles!ticket_messages_sender_id_fkey(name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const mappedMessages: TicketMessage[] = (messages || []).map((m: any) => ({
    id: m.id,
    ticketId: m.ticket_id,
    senderId: m.sender_id,
    senderName: (m.profiles as any)?.name || (m.is_staff ? "Support Staff" : "Customer"),
    isStaff: m.is_staff,
    message: m.message,
    attachments: m.attachments || [],
    createdAt: m.created_at,
  }));

  return {
    id: ticket.id,
    ticketNumber: ticket.ticket_number,
    customerId: ticket.customer_id,
    customerName: (ticket.profiles as any)?.name,
    customerEmail: (ticket.profiles as any)?.email,
    orderId: ticket.order_id,
    orderNumber: (ticket.orders as any)?.order_number || null,
    category: ticket.category as TicketCategory,
    subject: ticket.subject,
    description: ticket.description,
    priority: ticket.priority as TicketPriority,
    status: ticket.status as TicketStatus,
    assignedTo: ticket.assigned_to,
    resolutionNotes: ticket.resolution_notes,
    resolvedAt: ticket.resolved_at,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    messages: mappedMessages,
  };
}

/**
 * Admin action to update ticket status, assign staff, or resolve ticket (2.24, 2.27).
 */
export async function adminUpdateTicket(params: {
  ticketId: string;
  adminId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string | null;
  resolutionNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { ticketId, status, priority, assignedTo, resolutionNotes } = params;
  const adminDb = createAdminClient();

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (status) {
    updatePayload.status = status;
    if (status === "resolved" || status === "closed") {
      updatePayload.resolved_at = new Date().toISOString();
    }
  }

  if (priority) updatePayload.priority = priority;
  if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo;
  if (resolutionNotes !== undefined) updatePayload.resolution_notes = resolutionNotes;

  const { error } = await adminDb
    .from("support_tickets")
    .update(updatePayload as any)
    .eq("id", ticketId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}

/**
 * Retrieves paginated tickets for admin support portal (2.24, 2.27).
 */
export async function getAdminSupportTickets(params?: {
  status?: string;
  category?: string;
  priority?: string;
  page?: number;
  limit?: number;
}): Promise<{ tickets: SupportTicket[]; total: number }> {
  const adminDb = createAdminClient();
  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = (page - 1) * limit;

  let query = adminDb
    .from("support_tickets")
    .select(`
      *,
      profiles!support_tickets_customer_id_fkey(name, email),
      orders(order_number)
    `, { count: "exact" });

  if (params?.status && params.status !== "ALL") {
    query = query.eq("status", params.status);
  }
  if (params?.category && params.category !== "ALL") {
    query = query.eq("category", params.category);
  }
  if (params?.priority && params.priority !== "ALL") {
    query = query.eq("priority", params.priority);
  }

  query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error || !data) return { tickets: [], total: 0 };

  const tickets: SupportTicket[] = data.map((t: any) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    customerId: t.customer_id,
    customerName: (t.profiles as any)?.name,
    customerEmail: (t.profiles as any)?.email,
    orderId: t.order_id,
    orderNumber: (t.orders as any)?.order_number || null,
    category: t.category,
    subject: t.subject,
    description: t.description,
    priority: t.priority,
    status: t.status,
    assignedTo: t.assigned_to,
    resolutionNotes: t.resolution_notes,
    resolvedAt: t.resolved_at,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  return { tickets, total: count || 0 };
}
