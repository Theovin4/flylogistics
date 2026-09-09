import { NextResponse } from "next/server";

function legacyAuthDisabled() {
  return NextResponse.json(
    { error: "Legacy authentication is disabled. Use the Fly Logistics Supabase Auth flow." },
    { status: 404 }
  );
}

export const handlers = {
  GET: legacyAuthDisabled,
  POST: legacyAuthDisabled
};

export async function auth() {
  return null;
}

export async function signIn() {
  throw new Error("Legacy NextAuth sign-in is disabled. Use Supabase Auth.");
}

export async function signOut() {
  throw new Error("Legacy NextAuth sign-out is disabled. Use Supabase Auth.");
}
