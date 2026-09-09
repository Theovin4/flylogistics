#!/usr/bin/env npx tsx
/**
 * Complete admin setup and role management for Fly Logistics.
 * Usage: npx tsx scripts/admin-setup.ts [command] [email]
 *
 * Commands:
 *   list              List all users and their roles
 *   set-admin <email> Promote a user to admin
 *   list-admins       List all admin users
 */

import { createClient } from "@supabase/supabase-js";

type UserProfileRow = {
  id?: string;
  email?: string | null;
  full_name?: string | null;
  company?: string | null;
  role?: string | null;
  created_at?: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables.");
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const roleLabels: Record<string, string> = {
  admin: "ADMIN",
  dispatcher: "DISPATCHER",
  driver: "DRIVER",
  customer: "CUSTOMER"
};

function displayRole(role: string | null | undefined) {
  return roleLabels[String(role ?? "customer").toLowerCase()] ?? "UNKNOWN";
}

async function listAllUsers() {
  console.log("\nFetching all users and their roles...\n");

  try {
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, company, role, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!profiles || profiles.length === 0) {
      console.log("No users found in user_profiles table.\n");
      return;
    }

    (profiles as UserProfileRow[]).forEach((profile, index) => {
      console.log(`${index + 1}. [${displayRole(profile.role)}] ${profile.email ?? "(no email)"}`);
      console.log(`   Name: ${profile.full_name || "(not set)"}`);
      console.log(`   Company: ${profile.company || "(not set)"}`);
      console.log(`   Joined: ${profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "(unknown)"}`);
      console.log("");
    });
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function listAdmins() {
  console.log("\nAdmin users:\n");

  try {
    const { data: profiles, error } = await supabase
      .from("user_profiles")
      .select("email, full_name, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!profiles || profiles.length === 0) {
      console.log("No admin users found.\n");
      return;
    }

    (profiles as UserProfileRow[]).forEach((profile, index) => {
      console.log(`${index + 1}. ${profile.email ?? "(no email)"} (${profile.full_name || "No name set"})`);
    });
    console.log("");
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function setAdminRole(email: string) {
  try {
    console.log(`\nSetting ${email} as admin...\n`);

    const { data: existing, error: checkError } = await supabase
      .from("user_profiles")
      .select("id, email, role")
      .eq("email", email)
      .maybeSingle();

    if (checkError) throw checkError;

    if (!existing) {
      console.error(`User not found: ${email}`);
      console.error("Tip: make sure the user has registered and confirmed their email first.\n");
      await listAllUsers();
      process.exit(1);
    }

    if ((existing as UserProfileRow).role === "admin") {
      console.log(`User ${email} is already an admin.\n`);
      return;
    }

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ role: "admin" })
      .eq("email", email);

    if (updateError) throw updateError;

    console.log(`Successfully promoted ${email} to admin.\n`);
    console.log("They can now access /dashboard/admin and manage operations.\n");
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.log(`
usage: npx tsx scripts/admin-setup.ts [command] [args]

Commands:
  list              List all users and their roles
  set-admin <email> Promote a user to admin
  list-admins       List all admin users

Examples:
  npx tsx scripts/admin-setup.ts list
  npx tsx scripts/admin-setup.ts set-admin user@example.com
  npx tsx scripts/admin-setup.ts list-admins
    `);
    return;
  }

  if (command === "list") {
    await listAllUsers();
    return;
  }

  if (command === "list-admins") {
    await listAdmins();
    return;
  }

  if (command === "set-admin") {
    const email = process.argv[3];
    if (!email) {
      console.error("Email is required.\nUsage: npx tsx scripts/admin-setup.ts set-admin <email>\n");
      process.exit(1);
    }
    await setAdminRole(email);
    return;
  }

  console.error(`Unknown command: ${command}\n`);
  console.error("Run with no args to see available commands.\n");
  process.exit(1);
}

void main();
