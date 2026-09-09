import { NextResponse } from "next/server";
import { z } from "zod";
import { getGroq } from "@/lib/groq";
import { requireRole } from "@/lib/request-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { apiError, enforceRateLimit, parseJson } from "@/server/api";
import { writeAuditLog } from "@/server/audit";
import {
  answerIntelligenceQuestion,
  buildLogisticsIntelligenceReport,
  type IntelligenceDriverRow,
  type IntelligenceQuoteRow,
  type IntelligenceShipmentRow,
  type IntelligenceSupportTicketRow,
  type LogisticsIntelligenceReport
} from "@/server/ai-logistics-intelligence";
import { logApiError, requestContext } from "@/server/monitoring";
import { writeOperationalEvent } from "@/server/operational-events";

export const dynamic = "force-dynamic";

const questionSchema = z.object({
  question: z.string().trim().min(3).max(1000)
});

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "42703" || String(error?.code ?? "").startsWith("PGRST") || message.includes("could not find");
}

async function safeRows<T>(
  request: Request,
  resultPromise: PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  label: string
) {
  const result = await resultPromise;
  if (result.error) {
    if (isMissingTable(result.error)) return [] as T[];
    logApiError(result.error, `Unable to load ${label}.`, requestContext(request));
    return [] as T[];
  }
  return (result.data ?? []) as T[];
}

async function loadIntelligenceReport(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { report: null, error: "AI logistics intelligence is temporarily unavailable." };

  const [shipments, drivers, quotes, supportTickets] = await Promise.all([
    safeRows<IntelligenceShipmentRow>(
      request,
      supabase.from("shipments").select("*").order("created_at", { ascending: false }).limit(2000),
      "shipment intelligence data"
    ),
    safeRows<IntelligenceDriverRow>(
      request,
      supabase.from("drivers").select("*").order("id", { ascending: true }).limit(500),
      "driver intelligence data"
    ),
    safeRows<IntelligenceQuoteRow>(
      request,
      supabase.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(1500),
      "quote intelligence data"
    ),
    safeRows<IntelligenceSupportTicketRow>(
      request,
      supabase.from("customer_support_tickets").select("*").order("created_at", { ascending: false }).limit(500),
      "support intelligence data"
    )
  ]);

  return {
    report: buildLogisticsIntelligenceReport({ shipments, drivers, quotes, supportTickets }),
    error: null
  };
}

async function aiOperationsBrief(report: LogisticsIntelligenceReport) {
  const groq = getGroq();
  if (!groq) return report.assistantBrief;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are Fly Logistics AI Operations Assistant. Summarize logistics risks and actions for an admin. Use concise business language. Do not mention model providers or technical infrastructure."
        },
        {
          role: "user",
          content: JSON.stringify({
            metrics: report.metrics,
            insights: report.insights,
            delayedShipments: report.delayedShipments.slice(0, 5),
            overloadedDrivers: report.overloadedDrivers.slice(0, 5),
            topRiskAlerts: report.riskAlerts.slice(0, 5),
            forecasting: report.forecasting,
            fraudIntelligence: report.fraudIntelligence,
            demandIntelligence: report.demandIntelligence,
            actionPlan: report.actionPlan,
            forecastScenarios: report.forecastScenarios,
            fraudControls: report.fraudControls,
            supportIntelligence: report.supportIntelligence,
            driverPerformanceBands: report.driverPerformanceBands,
            revenueIntelligence: report.revenueIntelligence
          })
        }
      ]
    });

    return response.choices[0]?.message?.content?.trim() || report.assistantBrief;
  } catch {
    return report.assistantBrief;
  }
}

async function aiOperationsAnswer(question: string, report: LogisticsIntelligenceReport) {
  const groq = getGroq();
  if (!groq) return answerIntelligenceQuestion(question, report);

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are Fly Logistics AI Operations Assistant. Answer admin questions using the provided operations intelligence. Be direct, practical, and logistics-focused. Do not expose internal infrastructure names."
        },
        {
          role: "user",
          content: JSON.stringify({
            question,
            report: {
              metrics: report.metrics,
              insights: report.insights,
              delayedShipments: report.delayedShipments.slice(0, 10),
              overloadedDrivers: report.overloadedDrivers.slice(0, 10),
              routeProfitability: report.routeProfitability.slice(0, 10),
              etaPredictions: report.etaPredictions.slice(0, 10),
              riskAlerts: report.riskAlerts.slice(0, 10),
              driverIntelligence: report.driverIntelligence.slice(0, 10),
              forecasting: report.forecasting,
              fraudIntelligence: report.fraudIntelligence,
              demandIntelligence: report.demandIntelligence,
              actionPlan: report.actionPlan,
              forecastScenarios: report.forecastScenarios,
              fraudControls: report.fraudControls,
              supportIntelligence: report.supportIntelligence,
              driverPerformanceBands: report.driverPerformanceBands,
              revenueIntelligence: report.revenueIntelligence
            }
          })
        }
      ]
    });

    return response.choices[0]?.message?.content?.trim() || answerIntelligenceQuestion(question, report);
  } catch (error) {
    logApiError(error, "AI operations answer failed; using fallback intelligence answer.");
    return answerIntelligenceQuestion(question, report);
  }
}

async function storeReport(report: LogisticsIntelligenceReport, request: Request, actor: { id?: string | null; email?: string | null; role?: string | null } | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("ai_intelligence_reports").insert({
    report_type: "operations",
    summary: report.assistantBrief,
    metrics: report.metrics,
    insights: {
      insights: report.insights,
      delayedShipments: report.delayedShipments.slice(0, 20),
      riskAlerts: report.riskAlerts.slice(0, 20),
      routeOptimization: report.routeOptimization,
      forecasting: report.forecasting,
      fraudIntelligence: report.fraudIntelligence,
      demandIntelligence: report.demandIntelligence,
      actionPlan: report.actionPlan,
      forecastScenarios: report.forecastScenarios,
      fraudControls: report.fraudControls,
      supportIntelligence: report.supportIntelligence,
      driverPerformanceBands: report.driverPerformanceBands,
      revenueIntelligence: report.revenueIntelligence
    },
    generated_by: actor?.id ?? null
  });

  if (error && !isMissingTable(error)) {
    logApiError(error, "Unable to store AI intelligence report.", requestContext(request));
  }
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "admin-intelligence", { limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher", "finance", "customer_care"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const { report, error } = await loadIntelligenceReport(request);
  if (!report) return apiError(error ?? "Unable to build intelligence report.", { status: 503 });

  const assistantBrief = await aiOperationsBrief(report);
  const enrichedReport = { ...report, assistantBrief };
  void storeReport(enrichedReport, request, access.profile);

  await writeOperationalEvent(getSupabaseAdmin(), {
    category: "ai",
    message: "AI logistics intelligence report generated.",
    entityType: "ai_intelligence_report",
    metadata: { metrics: enrichedReport.metrics },
    request
  });

  return NextResponse.json(enrichedReport);
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "admin-intelligence-question", { limit: 30, windowSeconds: 60 });
  if (limited) return limited;

  const access = await requireRole(request, ["admin", "dispatcher", "finance", "customer_care"]);
  if (!access.profile) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = await parseJson(request, questionSchema, "Ask a clear operations intelligence question.");
  if (parsed.response) return parsed.response;

  const { report, error } = await loadIntelligenceReport(request);
  if (!report) return apiError(error ?? "Unable to build intelligence report.", { status: 503 });

  const answer = await aiOperationsAnswer(parsed.data.question, report);
  const supabase = getSupabaseAdmin();
  await writeAuditLog(supabase, {
    actor: access.profile,
    action: "ai_intelligence.ask",
    entityType: "ai_intelligence_report",
    metadata: { question: parsed.data.question },
    request
  });

  await writeOperationalEvent(supabase, {
    category: "ai",
    message: "AI operations assistant answered a question.",
    entityType: "ai_intelligence_report",
    metadata: { question: parsed.data.question },
    request
  });

  return NextResponse.json({ answer, generatedAt: new Date().toISOString() });
}
