import { NextResponse } from "next/server";
import { cleanEnv } from "@/lib/env";
import { logError, requestContext } from "@/server/monitoring";
import { publishScheduledBlogPosts } from "@/server/blog-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await publishScheduledBlogPosts();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    logError(error, "Daily blog cron failed.", requestContext(request));
    return NextResponse.json({ error: "Daily editorial publishing could not complete." }, { status: 500 });
  }
}
