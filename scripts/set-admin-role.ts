#!/usr/bin/env npx ts-node
/**
 * Script to set a user as admin in Supabase
 * Usage: npx ts-node scripts/set-admin-role.ts <user-email>
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing SUPABASE environment variables");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "❌");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "❌");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setAdminRole(email: string) {
  try {
    console.log(`\n🔍 Looking up user: ${email}`);

    // Get user by email using admin API
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;

    const user = users.users.find((u) => u.email === email);
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      console.log("\nAvailable users:");
      users.users.forEach((u) => console.log(`  - ${u.email}`));
      process.exit(1);
    }

    console.log(`✓ Found user: ${user.id}`);

    // Update user_profiles role to admin
    console.log("📝 Updating user profile role to 'admin'...");
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ role: "admin" })
      .eq("id", user.id);

    if (updateError) throw updateError;

    console.log(`✅ Successfully set ${email} as admin!\n`);

    // Show updated profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      console.log("Updated profile:");
      console.log(`  ID:        ${profile.id}`);
      console.log(`  Email:     ${profile.email}`);
      console.log(`  Full Name: ${profile.full_name || "Not set"}`);
      console.log(`  Role:      ${profile.role}`);
      console.log("\n✨ You can now login to the admin dashboard!\n");
    }
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx ts-node scripts/set-admin-role.ts <email>");
  console.error("Example: npx ts-node scripts/set-admin-role.ts admin@example.com");
  process.exit(1);
}

void setAdminRole(email);
