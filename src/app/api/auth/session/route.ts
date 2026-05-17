import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const sessionSchema = z.object({
  accessToken: z.string().min(20),
  expiresIn: z.number().int().positive().optional()
});

export async function POST(request: Request) {
  const parsed = sessionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid session payload." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase Auth is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase.auth.getUser(parsed.data.accessToken);
  if (error || !data.user) {
    if (error) console.error(error);
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("fly_session", parsed.data.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.min(parsed.data.expiresIn ?? 60 * 60, 60 * 60 * 24 * 7)
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("fly_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
