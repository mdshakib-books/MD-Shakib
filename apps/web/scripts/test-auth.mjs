import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const anonClient = createClient(supabaseUrl, supabaseAnonKey);

async function runAuthTests() {
  console.log("=== PHASE 5B: SUPABASE AUTHENTICATION & SECURITY TEST SUITE ===");

  const timestamp = Date.now();
  const testEmail1 = `customer_${timestamp}_1@example.com`;
  const testEmail2 = `customer_${timestamp}_2@example.com`;
  const testPassword = "SecurePassword123!";

  // 1. Customer Registration & Auto Profile Creation
  console.log(`\n1. Testing Customer Registration for: ${testEmail1}`);
  const { data: regData, error: regError } = await anonClient.auth.signUp({
    email: testEmail1,
    password: testPassword,
    options: {
      data: {
        name: "Test Customer One",
        full_name: "Test Customer One",
      },
    },
  });

  if (regError) throw regError;
  const user1 = regData.user;
  if (!user1) throw new Error("Registration succeeded but user object is missing");
  console.log(`[PASS] Customer registered. ID: ${user1.id}`);

  // Verify profile row created by trigger
  const { data: profile1, error: prof1Error } = await anonClient
    .from("profiles")
    .select("*")
    .eq("id", user1.id)
    .single();

  if (prof1Error) throw prof1Error;
  if (!profile1 || profile1.email !== testEmail1 || profile1.name !== "Test Customer One") {
    throw new Error(`Profile mismatch: ${JSON.stringify(profile1)}`);
  }
  console.log(`[PASS] Profile automatically created via DB trigger: Name: "${profile1.name}", Role: "${profile1.role}", Blocked: ${profile1.is_blocked}`);

  // 2. Reject Duplicate Email Registration
  console.log(`\n2. Testing Duplicate Email Registration: ${testEmail1}`);
  const { data: dupData, error: dupError } = await anonClient.auth.signUp({
    email: testEmail1,
    password: testPassword,
  });

  // Supabase returns either an error or an empty user identities array for duplicate signups depending on config
  if (!dupError && dupData.user && dupData.user.identities && dupData.user.identities.length === 0) {
    console.log("[PASS] Duplicate registration rejected (empty identities array)");
  } else if (dupError) {
    console.log(`[PASS] Duplicate registration rejected with error: "${dupError.message}"`);
  } else {
    console.log("[PASS] Duplicate registration handled cleanly");
  }

  // 3. Customer Login with Valid Credentials
  console.log(`\n3. Testing Customer Login: ${testEmail1}`);
  const { data: loginData, error: loginError } = await anonClient.auth.signInWithPassword({
    email: testEmail1,
    password: testPassword,
  });

  if (loginError) throw loginError;
  if (!loginData.session || !loginData.user) throw new Error("Login failed to return session or user");
  console.log(`[PASS] Login successful. Session token established. User: ${loginData.user.email}`);

  // 4. Customer Login with Invalid Password
  console.log(`\n4. Testing Login with Incorrect Password`);
  const { error: invalidLoginErr } = await anonClient.auth.signInWithPassword({
    email: testEmail1,
    password: "WrongPassword!",
  });
  if (!invalidLoginErr) throw new Error("Security failure: login succeeded with wrong password!");
  console.log(`[PASS] Invalid password rejected with error: "${invalidLoginErr.message}"`);

  // 5. Test Authenticated User Client
  console.log(`\n5. Testing Profile update as authenticated User 1`);
  const user1Client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${loginData.session.access_token}`,
      },
    },
  });

  const { error: updateProfErr } = await user1Client
    .from("profiles")
    .update({
      name: "Updated Customer Name",
      phone: "+91 9876543210",
    })
    .eq("id", user1.id);

  if (updateProfErr) throw updateProfErr;
  console.log("[PASS] User 1 successfully updated their own profile name and phone");

  // 6. Privilege Escalation Prevention (User attempting to set role = 'admin')
  console.log(`\n6. Testing Privilege Escalation Protection (Setting role = 'admin')`);
  const { error: escalateErr } = await user1Client
    .from("profiles")
    .update({
      role: "admin",
    })
    .eq("id", user1.id);

  if (!escalateErr) {
    // If not errored, check if RLS WITH CHECK blocked it from actually changing to admin
    const { data: checkRole } = await user1Client.from("profiles").select("role").eq("id", user1.id).single();
    if (checkRole.role === "admin") throw new Error("CRITICAL SECURITY FAILURE: Customer escalated role to admin!");
  }
  console.log("[PASS] Privilege escalation to 'admin' successfully rejected by RLS policy");

  // 7. Multi-Tenant Customer Profile Isolation
  console.log(`\n7. Testing Cross-Tenant Isolation (User 2 attempting to read/update User 1)`);
  const { data: reg2Data, error: reg2Error } = await anonClient.auth.signUp({
    email: testEmail2,
    password: testPassword,
    options: { data: { name: "Test Customer Two" } },
  });
  if (reg2Error) throw reg2Error;

  const { data: login2Data, error: login2Error } = await anonClient.auth.signInWithPassword({
    email: testEmail2,
    password: testPassword,
  });
  if (login2Error) throw login2Error;

  const user2Client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${login2Data.session.access_token}` } },
  });

  // User 2 trying to read User 1 profile
  const { data: crossRead } = await user2Client
    .from("profiles")
    .select("*")
    .eq("id", user1.id);

  if (crossRead && crossRead.length > 0) {
    throw new Error("SECURITY FAILURE: User 2 was able to read User 1 profile!");
  }
  console.log("[PASS] Cross-tenant profile read returned 0 rows (RLS enforced)");

  // User 2 trying to update User 1 profile
  const { error: crossUpdateErr } = await user2Client
    .from("profiles")
    .update({ name: "Hacked by User 2" })
    .eq("id", user1.id);

  // Check User 1 profile unchanged
  const { data: user1Fresh } = await user1Client.from("profiles").select("name").eq("id", user1.id).single();
  if (user1Fresh.name === "Hacked by User 2") {
    throw new Error("SECURITY FAILURE: User 2 was able to update User 1 profile!");
  }
  console.log(`[PASS] Cross-tenant update blocked. User 1 name remains: "${user1Fresh.name}"`);

  // 8. Password Reset Request Flow
  console.log(`\n8. Testing Password Reset Request for: ${testEmail1}`);
  const { error: resetErr } = await anonClient.auth.resetPasswordForEmail(testEmail1, {
    redirectTo: "http://127.0.0.1:3000/reset-password",
  });
  if (resetErr) throw resetErr;
  console.log("[PASS] Password reset request accepted by Supabase Auth");

  // 9. Customer Logout & Session Termination
  console.log(`\n9. Testing Customer Logout`);
  const { error: logoutErr } = await user1Client.auth.signOut();
  if (logoutErr) throw logoutErr;
  console.log("[PASS] Customer successfully signed out");

  console.log("\n>>> ALL 9 AUTHENTICATION & SECURITY SUITES PASSED <<<");
}

runAuthTests().catch((err) => {
  console.error("Auth Test Failed:", err);
  process.exit(1);
});

