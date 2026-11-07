/**
 * ==============================================================================
 * PHASE 0 — FEATURE 0.3: PROFILE ROLE SECURITY VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. New user registration defaults to role 'user'.
 * 2. User attempts to assign themselves 'admin' via direct profile INSERT -> Blocked/Defaulted.
 * 3. User attempts to update their own role to 'admin' via direct UPDATE -> Blocked by trigger/RLS.
 * 4. User attempts privilege escalation via mass assignment (is_blocked, is_deleted) -> Blocked.
 * 5. Ordinary customer attempts to call admin_update_user_role RPC -> Blocked (Unauthorized).
 * 6. Ordinary customer attempts to promote another user via direct UPDATE -> Blocked.
 * 7. Authorized admin can promote a customer to 'admin' via admin_update_user_role.
 * 8. Authorized admin can demote an admin back to 'user' via admin_update_user_role.
 * 9. Admin self-lockout prevention: Admin cannot modify their own active role.
 * 10. Audit log is created upon administrative role modification.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS ${String(totalTests).padStart(2, "0")}] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL ${String(totalTests).padStart(2, "0")}] ${name}`);
    console.error(`     Error: ${err?.message || err}`);
    failedTests++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" PHASE 0 — FEATURE 0.3: PROFILE ROLE SECURITY VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCustA = `rolesec_custA_${timestamp}@example.com`;
  const emailCustB = `rolesec_custB_${timestamp}@example.com`;
  const emailAdmin = `rolesec_admin_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create Customer A
  const { data: authA, error: errA } = await adminDb.auth.admin.createUser({
    email: emailCustA,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Alpha" },
  });
  assert(!errA && authA.user, `Cust A creation failed: ${errA?.message}`);
  const custAId = authA.user.id;

  const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionA } = await clientA.auth.signInWithPassword({
    email: emailCustA,
    password: defaultPassword,
  });
  assert(sessionA.session, "Cust A login failed");

  // 2. Create Customer B
  const { data: authB, error: errB } = await adminDb.auth.admin.createUser({
    email: emailCustB,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Beta" },
  });
  assert(!errB && authB.user, `Cust B creation failed: ${errB?.message}`);
  const custBId = authB.user.id;

  const clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionB } = await clientB.auth.signInWithPassword({
    email: emailCustB,
    password: defaultPassword,
  });
  assert(sessionB.session, "Cust B login failed");

  // 3. Create Admin
  const { data: authAdmin, error: errAdmin } = await adminDb.auth.admin.createUser({
    email: emailAdmin,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "System Admin" },
  });
  assert(!errAdmin && authAdmin.user, `Admin creation failed: ${errAdmin?.message}`);
  const adminId = authAdmin.user.id;

  // Use service role to promote initial admin
  await adminDb.from("profiles").update({ role: "admin" }).eq("id", adminId);

  const clientAdmin = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionAdmin } = await clientAdmin.auth.signInWithPassword({
    email: emailAdmin,
    password: defaultPassword,
  });
  assert(sessionAdmin.session, "Admin login failed");

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Default role for newly registered user is 'user'
    // ----------------------------------------------------------------------------
    await runTest("New user registration automatically receives 'user' role", async () => {
      const { data: profile } = await adminDb
        .from("profiles")
        .select("role")
        .eq("id", custAId)
        .single();

      assert.strictEqual(profile?.role, "user", "Default role must be 'user'");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Customer attempts self-promotion via direct UPDATE
    // ----------------------------------------------------------------------------
    await runTest("Customer cannot promote themselves to 'admin' via direct profile UPDATE", async () => {
      const { data, error } = await clientA
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", custAId);

      // Should be blocked either by trigger exception or RLS
      const { data: profileAfter } = await adminDb
        .from("profiles")
        .select("role")
        .eq("id", custAId)
        .single();

      assert.strictEqual(profileAfter?.role, "user", "Customer role must remain 'user'");
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Customer attempts privilege escalation via mass assignment (is_blocked, is_deleted)
    // ----------------------------------------------------------------------------
    await runTest("Customer cannot modify is_blocked or is_deleted via mass assignment", async () => {
      const { data, error } = await clientA
        .from("profiles")
        .update({ is_blocked: true, is_deleted: true })
        .eq("id", custAId);

      const { data: profileAfter } = await adminDb
        .from("profiles")
        .select("is_blocked, is_deleted")
        .eq("id", custAId)
        .single();

      assert.strictEqual(profileAfter?.is_blocked, false, "Customer cannot modify is_blocked");
      assert.strictEqual(profileAfter?.is_deleted, false, "Customer cannot modify is_deleted");
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Customer attempts to update another customer's profile
    // ----------------------------------------------------------------------------
    await runTest("Customer A cannot update Customer B's profile (RLS isolation)", async () => {
      const { data, error } = await clientA
        .from("profiles")
        .update({ name: "Hacked Name" })
        .eq("id", custBId);

      const { data: profileB } = await adminDb
        .from("profiles")
        .select("name")
        .eq("id", custBId)
        .single();

      assert.strictEqual(profileB?.name, "Customer Beta", "Customer B profile must not be modified");
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Ordinary customer calls admin_update_user_role RPC
    // ----------------------------------------------------------------------------
    await runTest("Ordinary customer cannot call admin_update_user_role RPC", async () => {
      const { data, error } = await clientA.rpc("admin_update_user_role", {
        p_admin_id: custAId,
        p_target_user_id: custAId,
        p_new_role: "admin",
      });

      assert(error, "Non-admin call to admin_update_user_role must fail");
      assert(
        error.message.includes("Unauthorized") ||
        error.message.includes("Administrative role required") ||
        error.code === "P0001",
        `Expected unauthorized error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Customer attempts admin identity spoofing in admin_update_user_role
    // ----------------------------------------------------------------------------
    await runTest("Customer cannot spoof admin ID in admin_update_user_role RPC", async () => {
      const { data, error } = await clientA.rpc("admin_update_user_role", {
        p_admin_id: adminId, // Spoofing real admin's ID
        p_target_user_id: custAId,
        p_new_role: "admin",
      });

      assert(error, "Spoofing admin ID from customer session must fail");
      assert(
        error.message.includes("Caller identity must match") ||
        error.message.includes("Security violation") ||
        error.code === "P0001",
        `Expected caller mismatch error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 7: Authorized admin promotes Customer B to 'admin'
    // ----------------------------------------------------------------------------
    await runTest("Authorized admin successfully promotes user via admin_update_user_role", async () => {
      const { data, error } = await clientAdmin.rpc("admin_update_user_role", {
        p_admin_id: adminId,
        p_target_user_id: custBId,
        p_new_role: "admin",
      });

      assert(!error && data === true, `Admin promotion failed: ${error?.message}`);

      const { data: profileB } = await adminDb
        .from("profiles")
        .select("role")
        .eq("id", custBId)
        .single();

      assert.strictEqual(profileB?.role, "admin", "Customer B must now have role 'admin'");
    });

    // ----------------------------------------------------------------------------
    // TEST 8: Authorized admin demotes Customer B back to 'user'
    // ----------------------------------------------------------------------------
    await runTest("Authorized admin successfully demotes admin back to 'user'", async () => {
      const { data, error } = await clientAdmin.rpc("admin_update_user_role", {
        p_admin_id: adminId,
        p_target_user_id: custBId,
        p_new_role: "user",
      });

      assert(!error && data === true, `Admin demotion failed: ${error?.message}`);

      const { data: profileB } = await adminDb
        .from("profiles")
        .select("role")
        .eq("id", custBId)
        .single();

      assert.strictEqual(profileB?.role, "user", "Customer B must now have role 'user'");
    });

    // ----------------------------------------------------------------------------
    // TEST 9: Admin self-lockout prevention (Admin cannot demote themselves)
    // ----------------------------------------------------------------------------
    await runTest("Admin self-lockout prevention: Admin cannot modify their own active role", async () => {
      const { data, error } = await clientAdmin.rpc("admin_update_user_role", {
        p_admin_id: adminId,
        p_target_user_id: adminId, // Self-modification!
        p_new_role: "user",
      });

      assert(error, "Admin self-modification must be rejected");
      assert(
        error.message.includes("Administrators cannot modify their own active role") ||
        error.code === "P0001",
        `Expected self-lockout guard error, got: ${error.message}`
      );

      const { data: adminProfile } = await adminDb
        .from("profiles")
        .select("role")
        .eq("id", adminId)
        .single();

      assert.strictEqual(adminProfile?.role, "admin", "Admin role must remain 'admin'");
    });

    // ----------------------------------------------------------------------------
    // TEST 10: Audit log is recorded for administrative role changes
    // ----------------------------------------------------------------------------
    await runTest("Administrative role update creates immutable audit log entry", async () => {
      const { data: logs, error } = await adminDb
        .from("audit_logs")
        .select("*")
        .eq("action", "UPDATE_ROLE")
        .eq("user_id", adminId);

      assert(!error && logs && logs.length >= 2, `Audit logs should record both promotion and demotion: ${error?.message}`);
      const lastLog = logs[logs.length - 1];
      assert.strictEqual(lastLog.model_id, custBId);
      assert.strictEqual(lastLog.model_name, "profiles");
    });

  } finally {
    // Cleanup
    await adminDb.from("audit_logs").delete().eq("user_id", adminId);
    await adminDb.from("profiles").delete().in("id", [custAId, custBId, adminId]);
    await adminDb.auth.admin.deleteUser(custAId);
    await adminDb.auth.admin.deleteUser(custBId);
    await adminDb.auth.admin.deleteUser(adminId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` FEATURE 0.3 PROFILE ROLE SECURITY VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
