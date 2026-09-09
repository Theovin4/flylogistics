"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { flyError, flySuccess } from "@/components/feedback/fly-toast";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase";

export function AdminExportWorkbookButton() {
  const [loading, setLoading] = useState(false);

  async function exportWorkbook() {
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const headers = new Headers();
      if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);

      const response = await fetch("/api/admin/export/workbook", { headers, cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to export analysis workbook.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `fly-logistics-analysis-${new Date().toISOString().slice(0, 10)}.xls`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      flySuccess("Workbook exported", "Your Fly Logistics analysis workbook is downloading.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "Unable to export analysis workbook.";
      flyError("Export failed", nextError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={() => void exportWorkbook()} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <Download />}
      Export Excel workbook
    </Button>
  );
}
