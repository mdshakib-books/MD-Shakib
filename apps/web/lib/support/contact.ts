"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sendContactFormAcknowledgement } from "@/lib/integrations/resend/service";

export interface ContactSubmissionPayload {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

export interface ContactSubmissionResult {
  success: boolean;
  error?: string;
  submissionId?: string;
}

/**
 * Handles customer contact inquiries, validates input, prevents spam,
 * records in the database, and dispatches email notifications (Feature 1.20).
 */
export async function submitContactForm(
  data: ContactSubmissionPayload
): Promise<ContactSubmissionResult> {
  const name = (data.name || "").trim();
  const email = (data.email || "").toLowerCase().trim();
  const phone = (data.phone || "").trim() || null;
  const subject = (data.subject || "").trim();
  const message = (data.message || "").trim();

  // 1. Validation
  if (!name || name.length < 2 || name.length > 100) {
    return { success: false, error: "Please enter your name (2–100 characters)." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email) || email.length > 150) {
    return { success: false, error: "Please provide a valid email address." };
  }

  if (phone && !/^[+0-9\s-]{7,20}$/.test(phone)) {
    return { success: false, error: "Please enter a valid phone number." };
  }

  if (!subject || subject.length < 3 || subject.length > 200) {
    return { success: false, error: "Please enter a subject (3–200 characters)." };
  }

  if (!message || message.length < 10 || message.length > 3000) {
    return { success: false, error: "Message must be between 10 and 3,000 characters." };
  }

  // 2. Rate limiting check (prevent submission spam per email)
  const rl = await checkRateLimit(`contact:${email}`, "auth");
  if (!rl.allowed) {
    return {
      success: false,
      error: "You have submitted multiple inquiries recently. Please wait a few minutes before trying again.",
    };
  }

  // 3. Optional authenticated user detection
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id || null;

  // 4. Insert into contact_submissions
  const combinedMessage = phone ? `[Contact Phone: ${phone}]\n\n${message}` : message;
  const adminDb = createAdminClient();
  const { data: record, error: insertErr } = await adminDb
    .from("contact_submissions")
    .insert({
      user_id: userId,
      name,
      email,
      subject,
      message: combinedMessage,
      status: "new",
    })
    .select("id")
    .single();

  if (insertErr || !record) {
    console.error("Failed to persist contact submission:", insertErr?.message);
    return {
      success: false,
      error: "Unable to submit your message at this time. Please try again or email us directly.",
    };
  }

  // 5. Asynchronously dispatch customer acknowledgement & admin alert
  sendContactFormAcknowledgement({
    name,
    email,
    phone: phone || undefined,
    subject,
    message,
  }).catch((err) => console.error("Async contact notification error:", err));

  return { success: true, submissionId: record.id };
}
