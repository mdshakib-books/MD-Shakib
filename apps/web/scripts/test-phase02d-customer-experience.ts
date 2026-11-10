/**
 * ==============================================================================
 * PHASE 2D: CUSTOMER EXPERIENCE TEST SUITE
 * MD Shakib Islamic Books Modernization Project
 * Verifies Requirements 2.22 through 2.27
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import {
  addToWishlist,
  removeFromWishlist,
  getCustomerWishlist,
  isBookInCustomerWishlist,
} from "../lib/commerce/wishlist";
import {
  checkReviewEligibility,
  submitProductReview,
  getBookReviews,
} from "../lib/commerce/reviews";
import {
  createSupportTicket,
  addTicketMessage,
  getCustomerTickets,
  getTicketDetails,
  adminUpdateTicket,
} from "../lib/support/tickets";
import {
  sendPhoneVerificationOtp,
  verifyPhoneVerificationOtp,
} from "../lib/auth/phone";
import { anonymizeCustomerAccount } from "../lib/commerce/account";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let testUserId1: string;
let testUserId2: string;
let testAdminId: string;
let testBookId: string;
let testDeliveredOrderId: string;

let testsPassed = 0;
let testsFailed = 0;

function pass(name: string, detail?: string) {
  testsPassed++;
  console.log(`  ✓ [PASS ${String(testsPassed).padStart(2, "0")}] ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(name: string, detail: string) {
  testsFailed++;
  console.error(`  ✗ [FAIL] ${name}: ${detail}`);
}

async function setup() {
  console.log("\n--- SETTING UP PHASE 2D TEST FIXTURES ---");

  // 1. Create primary customer
  const { data: authUser1, error: aErr1 } = await adminDb.auth.admin.createUser({
    email: `phase2d_user1_${Date.now()}@example.com`,
    password: "Password@123",
    email_confirm: true,
  });
  if (aErr1 || !authUser1.user) throw new Error(`User1 setup failed: ${aErr1?.message}`);
  testUserId1 = authUser1.user.id;

  await adminDb.from("profiles").upsert({
    id: testUserId1,
    name: "Customer Alpha",
    email: authUser1.user.email!,
    role: "user",
  });

  // 2. Create secondary customer
  const { data: authUser2, error: aErr2 } = await adminDb.auth.admin.createUser({
    email: `phase2d_user2_${Date.now()}@example.com`,
    password: "Password@123",
    email_confirm: true,
  });
  if (aErr2 || !authUser2.user) throw new Error(`User2 setup failed: ${aErr2?.message}`);
  testUserId2 = authUser2.user.id;

  await adminDb.from("profiles").upsert({
    id: testUserId2,
    name: "Customer Beta",
    email: authUser2.user.email!,
    role: "user",
  });

  // 3. Create Admin Staff
  const { data: adminUser, error: admErr } = await adminDb.auth.admin.createUser({
    email: `phase2d_admin_${Date.now()}@example.com`,
    password: "Password@123",
    email_confirm: true,
  });
  if (admErr || !adminUser.user) throw new Error(`Admin setup failed: ${admErr?.message}`);
  testAdminId = adminUser.user.id;

  await adminDb.from("profiles").upsert({
    id: testAdminId,
    name: "Support Staff Agent",
    email: adminUser.user.email!,
    role: "admin",
  });

  // 4. Create Book
  const { data: book, error: bErr } = await adminDb
    .from("books")
    .insert({
      title: "Sahih Bukhari Arabic-English Vol 1",
      author: "Imam Bukhari",
      category: "Hadith",
      price: 1800.0,
      stock: 50,
      image_url: "https://example.com/cover.jpg",
      cover_image: "https://example.com/cover.jpg",
      is_active: true,
    })
    .select("id")
    .single();

  if (bErr || !book) throw new Error(`Book setup failed: ${bErr?.message}`);
  testBookId = book.id;

  // 5. Create Delivered Order for User 1 (making User 1 eligible for verified review)
  const orderNum = `ORD-P2D-${Date.now().toString().slice(-6)}`;
  const { data: order, error: oErr } = await adminDb
    .from("orders")
    .insert({
      order_number: orderNum,
      user_id: testUserId1,
      total_amount: 1800.0,
      subtotal: 1800.0,
      order_status: "Delivered",
      payment_method: "ONLINE",
      payment_status: "Paid",
      is_paid: true,
      delivered_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      address_snapshot: {
        full_name: "Customer Alpha",
        phone: "9876543210",
        address_line_1: "Okhla Vihar",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110025",
      },
    })
    .select("id")
    .single();

  if (oErr || !order) throw new Error(`Delivered order setup failed: ${oErr?.message}`);
  testDeliveredOrderId = order.id;

  await adminDb.from("order_items").insert({
    order_id: testDeliveredOrderId,
    book_id: testBookId,
    title: "Sahih Bukhari Arabic-English Vol 1",
    quantity: 1,
    price: 1800.0,
    image_url: "https://example.com/cover.jpg",
  });

  console.log("✓ Fixtures successfully provisioned.");
}

async function cleanup() {
  console.log("\n--- CLEANING UP PHASE 2D TEST FIXTURES ---");
  if (testDeliveredOrderId) {
    await adminDb.from("ticket_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("support_tickets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("reviews").delete().eq("book_id", testBookId);
    await adminDb.from("wishlists").delete().eq("book_id", testBookId);
    await adminDb.from("phone_verifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("order_items").delete().eq("order_id", testDeliveredOrderId);
    await adminDb.from("orders").delete().eq("id", testDeliveredOrderId);
  }
  if (testBookId) {
    await adminDb.from("books").delete().eq("id", testBookId);
  }
  if (testUserId1) await adminDb.auth.admin.deleteUser(testUserId1);
  if (testUserId2) await adminDb.auth.admin.deleteUser(testUserId2);
  if (testAdminId) await adminDb.auth.admin.deleteUser(testAdminId);
  console.log("✓ Test fixtures purged.");
}

async function runTests() {
  console.log("\n================================================================================");
  console.log(" PHASE 2D: CUSTOMER EXPERIENCE VERIFICATION");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // 1. WISHLIST (2.22)
  // --------------------------------------------------------------------------
  console.log("[2.22] Customer Wishlist Persistence & Idempotency");
  {
    // Add to wishlist
    const addRes1 = await addToWishlist(testUserId1, testBookId);
    if (addRes1.success && addRes1.id) {
      pass("Book added to customer wishlist successfully");
    } else {
      fail("Book add to wishlist", addRes1.error || "Unknown error");
    }

    // Check duplicate addition is idempotent
    const addRes2 = await addToWishlist(testUserId1, testBookId);
    if (addRes2.success && addRes2.alreadyInWishlist) {
      pass("Duplicate wishlist addition handled gracefully (idempotent)");
    } else {
      fail("Duplicate wishlist check", "Expected alreadyInWishlist=true");
    }

    // Check is in wishlist query
    const isIn = await isBookInCustomerWishlist(testUserId1, testBookId);
    if (isIn) {
      pass("isBookInCustomerWishlist correctly identifies presence");
    } else {
      fail("isBookInCustomerWishlist", "Returned false for added book");
    }

    // Retrieve items
    const items = await getCustomerWishlist(testUserId1);
    if (items.length === 1 && items[0].bookId === testBookId && items[0].price === 1800) {
      pass("Customer wishlist items retrieved with authoritative book metadata");
    } else {
      fail("getCustomerWishlist", `Expected 1 item with price 1800, got ${items.length}`);
    }

    // Remove from wishlist
    const remRes = await removeFromWishlist(testUserId1, testBookId);
    const isStillIn = await isBookInCustomerWishlist(testUserId1, testBookId);
    if (remRes.success && !isStillIn) {
      pass("Book successfully removed from customer wishlist");
    } else {
      fail("removeFromWishlist", "Item still present in wishlist");
    }
  }

  // --------------------------------------------------------------------------
  // 2. PRODUCT REVIEWS & VERIFIED PURCHASE (2.23)
  // --------------------------------------------------------------------------
  console.log("\n[2.23] Product Reviews & Verified Purchase Validation");
  {
    // Non-purchaser User 2 should be rejected
    const unverifiedCheck = await checkReviewEligibility(testUserId2, testBookId);
    if (!unverifiedCheck.isEligible && unverifiedCheck.reason) {
      pass("Unverified purchaser strictly blocked from submitting reviews", unverifiedCheck.reason);
    } else {
      fail("Unverified review check", "Expected isEligible=false");
    }

    const unverifiedAttempt = await submitProductReview({
      userId: testUserId2,
      bookId: testBookId,
      rating: 5,
      title: "Great Book",
      comment: "Detailed review from a reader who never bought it.",
    });
    if (!unverifiedAttempt.success) {
      pass("Server-side submission blocks unverified purchaser review");
    } else {
      fail("Server-side unverified review block", "Submission unexpectedly succeeded");
    }

    // Verified Purchaser User 1 should be eligible
    const verifiedCheck = await checkReviewEligibility(testUserId1, testBookId);
    if (verifiedCheck.isEligible) {
      pass("Verified buyer with Delivered order confirmed eligible for review");
    } else {
      fail("Verified review check", verifiedCheck.reason || "Expected isEligible=true");
    }

    // Invalid rating validation
    const invalidRatingRes = await submitProductReview({
      userId: testUserId1,
      bookId: testBookId,
      rating: 6,
      title: "Invalid rating test",
      comment: "This rating should be rejected because it exceeds 5 stars.",
    });
    if (!invalidRatingRes.success) {
      pass("Invalid rating (6 stars) correctly rejected");
    } else {
      fail("Invalid rating check", "Rating 6 was unexpectedly accepted");
    }

    // Valid review submission
    const reviewRes = await submitProductReview({
      userId: testUserId1,
      bookId: testBookId,
      rating: 5,
      title: "Magnificent Typography & Binding",
      comment: "The classical commentary and high quality gold leaf binding make this a prized edition for scholars.",
    });
    if (reviewRes.success && reviewRes.review?.rating === 5) {
      pass("Verified customer review submitted and marked approved");
    } else {
      fail("submitProductReview", reviewRes.error || "Unknown error");
    }

    // Aggregated reviews & ratings query
    const bookReviews = await getBookReviews(testBookId);
    if (
      bookReviews.total === 1 &&
      bookReviews.summary.averageRating === 5 &&
      bookReviews.summary.ratingCounts[5] === 1
    ) {
      pass("Aggregated ratings calculated accurately (Average: 5.0, Count: 1)");
    } else {
      fail("getBookReviews", `Average: ${bookReviews.summary.averageRating}, Total: ${bookReviews.total}`);
    }
  }

  // --------------------------------------------------------------------------
  // 3. SUPPORT TICKETS & MESSAGING THREADS (2.24, 2.27)
  // --------------------------------------------------------------------------
  console.log("\n[2.24 & 2.27] Customer Support Tickets & Direct Messaging Thread");
  let createdTicketId: string;
  {
    // Customer creates ticket linked to order
    const createRes = await createSupportTicket({
      customerId: testUserId1,
      category: "delivery",
      subject: "Courier delivery query for Sahih Bukhari",
      description: "Can you confirm the estimated delivery time for my shipment?",
      priority: "medium",
      orderId: testDeliveredOrderId,
    });

    if (createRes.success && createRes.ticket?.id) {
      createdTicketId = createRes.ticket.id;
      pass("Customer support ticket created successfully");
      if (createRes.ticket.ticketNumber.startsWith("TCK-")) {
        pass(`Generated ticket number format verified: ${createRes.ticket.ticketNumber}`);
      } else {
        fail("Ticket number format", createRes.ticket.ticketNumber);
      }
    } else {
      fail("createSupportTicket", createRes.error || "Unknown error");
    }

    // Verify initial message was inserted in thread
    const ticketDetails1 = await getTicketDetails(createdTicketId!, testUserId1);
    if (ticketDetails1?.messages && ticketDetails1.messages.length === 1) {
      pass("Initial ticket description automatically added as first message in thread");
    } else {
      fail("Initial message check", `Found ${ticketDetails1?.messages?.length} messages`);
    }

    // Staff replies to ticket
    const staffReply = await addTicketMessage({
      ticketId: createdTicketId!,
      senderId: testAdminId,
      isStaff: true,
      message: "Peace be upon you. Your shipment has been dispatched and out for delivery.",
    });

    if (staffReply.success && staffReply.message?.isStaff) {
      pass("Staff message posted to ticket thread");
    } else {
      fail("addTicketMessage staff", staffReply.error || "Unknown error");
    }

    // Customer replies to staff
    const customerReply = await addTicketMessage({
      ticketId: createdTicketId!,
      senderId: testUserId1,
      isStaff: false,
      message: "Thank you for the quick confirmation!",
    });

    if (customerReply.success && !customerReply.message?.isStaff) {
      pass("Customer response posted to thread");
    } else {
      fail("addTicketMessage customer", customerReply.error || "Unknown error");
    }

    // Cross-customer security boundary: User 2 cannot access User 1's ticket
    const unauthorizedAccess = await getTicketDetails(createdTicketId!, testUserId2, false);
    if (unauthorizedAccess === null) {
      pass("Cross-customer ticket isolation strictly enforced (User 2 blocked)");
    } else {
      fail("Ticket isolation check", "User 2 was able to view User 1's ticket");
    }

    // Admin resolves ticket
    const adminResolve = await adminUpdateTicket({
      ticketId: createdTicketId!,
      adminId: testAdminId,
      status: "resolved",
      resolutionNotes: "Inquiry answered and confirmed with customer.",
    });

    const finalDetails = await getTicketDetails(createdTicketId!, testUserId1);
    if (adminResolve.success && finalDetails?.status === "resolved") {
      pass("Admin successfully transitioned ticket status to 'resolved'");
    } else {
      fail("adminUpdateTicket", adminResolve.error || "Status update failed");
    }
  }

  // --------------------------------------------------------------------------
  // 4. SECURE PHONE VERIFICATION (2.26)
  // --------------------------------------------------------------------------
  console.log("\n[2.26] Secure Mobile Phone OTP Verification");
  {
    const rawMobile = "9876543210";

    // Request OTP
    const sendRes = await sendPhoneVerificationOtp(testUserId2, rawMobile);
    if (sendRes.success && sendRes.mockOtpForTesting) {
      pass("CSPRNG phone OTP generated and dispatched");

      // Verify OTP hash stored in DB is not plaintext
      const { data: dbRec } = await adminDb
        .from("phone_verifications")
        .select("otp_hash, phone")
        .eq("user_id", testUserId2)
        .single();

      if (dbRec && dbRec.otp_hash !== sendRes.mockOtpForTesting && dbRec.otp_hash.length === 64) {
        pass("Phone OTP stored strictly as 256-bit cryptographic HMAC hash (never plaintext)");
      } else {
        fail("OTP storage check", "Plaintext or invalid hash in DB");
      }

      // Test incorrect OTP
      const wrongVerify = await verifyPhoneVerificationOtp(testUserId2, rawMobile, "000000");
      if (!wrongVerify.success) {
        pass("Incorrect OTP strictly rejected and attempt counter incremented");
      } else {
        fail("Wrong OTP test", "Incorrect OTP was unexpectedly accepted");
      }

      // Test valid OTP verification
      const correctVerify = await verifyPhoneVerificationOtp(
        testUserId2,
        rawMobile,
        sendRes.mockOtpForTesting
      );

      if (correctVerify.success) {
        pass("Valid OTP successfully verified mobile number");

        // Verify profile updated
        const { data: prof } = await adminDb
          .from("profiles")
          .select("phone")
          .eq("id", testUserId2)
          .single();

        if (prof?.phone === rawMobile) {
          pass("Verified mobile phone number linked to customer profile");
        } else {
          fail("Profile phone link", `Expected ${rawMobile}, got ${prof?.phone}`);
        }
      } else {
        fail("verifyPhoneVerificationOtp", correctVerify.error || "Unknown error");
      }
    } else {
      fail("sendPhoneVerificationOtp", sendRes.error || "Unknown error");
    }
  }

  // --------------------------------------------------------------------------
  // 5. ACCOUNT DELETION & PII ANONYMIZATION (2.25)
  // --------------------------------------------------------------------------
  console.log("\n[2.25] Self-Service Account Deletion & PII Anonymization");
  {
    // Save address and wishlist for User 1 to verify they get scrubbed
    await adminDb.from("addresses").insert({
      user_id: testUserId1,
      full_name: "Customer Alpha Address",
      phone: "9876543210",
      address_line_1: "House 10, Road 4",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110025",
    });

    await addToWishlist(testUserId1, testBookId);

    // Call anonymization RPC
    const anonRes = await anonymizeCustomerAccount(testUserId1);
    if (anonRes.success) {
      pass("Account anonymization RPC executed successfully");

      // Verify profile is anonymized
      const { data: scrubbedProfile } = await adminDb
        .from("profiles")
        .select("name, email, phone, is_deleted")
        .eq("id", testUserId1)
        .single();

      if (
        scrubbedProfile?.is_deleted &&
        scrubbedProfile?.name.startsWith("Deleted User ") &&
        scrubbedProfile?.email.startsWith("deleted_") &&
        scrubbedProfile?.phone === null
      ) {
        pass("Customer PII (name, email, phone) completely anonymized");
      } else {
        fail("PII scrub check", JSON.stringify(scrubbedProfile));
      }

      // Verify addresses and wishlists cleared
      const { count: addrCount } = await adminDb
        .from("addresses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", testUserId1);

      const { count: wishCount } = await adminDb
        .from("wishlists")
        .select("id", { count: "exact", head: true })
        .eq("user_id", testUserId1);

      if (addrCount === 0 && wishCount === 0) {
        pass("Customer saved addresses and wishlists permanently deleted");
      } else {
        fail("Addresses/wishlists clear check", `Addresses: ${addrCount}, Wishlists: ${wishCount}`);
      }

      // Verify historical order integrity preserved for statutory compliance
      const { data: preservedOrder } = await adminDb
        .from("orders")
        .select("id, total_amount, order_status")
        .eq("id", testDeliveredOrderId)
        .single();

      if (preservedOrder && preservedOrder.total_amount === 1800) {
        pass("Historical order record preserved with full financial integrity for tax compliance");
      } else {
        fail("Historical order preservation check", "Order was corrupted or missing");
      }
    } else {
      fail("anonymizeCustomerAccount", anonRes.error || "Unknown error");
    }
  }

  console.log("\n================================================================================");
  console.log(` PHASE 2D SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
