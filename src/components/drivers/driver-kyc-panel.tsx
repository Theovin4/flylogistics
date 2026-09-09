"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { CloudinaryUpload } from "@/components/cloudinary/cloudinary-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { driverTransportationOptions, normalizeTransportationType } from "@/lib/driver-data";
import { getSupabaseBrowser } from "@/lib/supabase";

type KycSubmission = {
  id: number | string;
  id_document_url?: string | null;
  license_url?: string | null;
  vehicle_type?: string | null;
  vehicle_plate_number?: string | null;
  vehicle_model?: string | null;
  status?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
};

const initialForm = {
  idDocumentUrl: "",
  licenseUrl: "",
  vehicleType: "bike",
  vehiclePlateNumber: "",
  vehicleModel: ""
};

function badgeClass(status?: string | null) {
  const normalized = String(status ?? "NOT_SUBMITTED").toUpperCase();
  if (normalized === "APPROVED") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (normalized === "REJECTED") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-primary/40 bg-primary/10 text-primary";
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

export function DriverKycPanel() {
  const [submission, setSubmission] = useState<KycSubmission | null>(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }, []);

  const authorizedFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const auth = await authHeaders();
    Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
    return fetch(input, { ...init, headers });
  }, [authHeaders]);

  const loadKyc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authorizedFetch("/api/driver/kyc");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load driver verification.");
      const nextSubmission = data.submission as KycSubmission | null;
      setSubmission(nextSubmission);
      setWarning(data.warning ?? null);
      if (nextSubmission) {
        setForm({
          idDocumentUrl: nextSubmission.id_document_url ?? "",
          licenseUrl: nextSubmission.license_url ?? "",
          vehicleType: normalizeTransportationType(nextSubmission.vehicle_type),
          vehiclePlateNumber: nextSubmission.vehicle_plate_number ?? "",
          vehicleModel: nextSubmission.vehicle_model ?? ""
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load driver verification.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadKyc();
  }, [loadKyc]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitKyc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authorizedFetch("/api/driver/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to submit driver verification.");
      setSubmission(data.submission);
      setMessage("Verification submitted. Operations will review your documents.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit driver verification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="size-5 text-primary" />
              Driver verification
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Submit ID, license, and vehicle details so operations can approve your rider profile for live deliveries.
            </p>
          </div>
          <Badge className={badgeClass(submission?.status)}>{submission?.status ?? "NOT SUBMITTED"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading ? (
          <div className="flex items-center gap-3 rounded-md border p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Loading verification status...
          </div>
        ) : (
          <>
            {message && (
              <div className="flex gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                {message}
              </div>
            )}
            {warning && (
              <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
                {warning}
              </div>
            )}
            {error && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            {submission && (
              <div className="grid gap-3 rounded-md border bg-background/45 p-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Submitted</p>
                  <p className="mt-2 font-medium">{formatDate(submission.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Reviewed</p>
                  <p className="mt-2 font-medium">{formatDate(submission.reviewed_at)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Operations note</p>
                  <p className="mt-2 font-medium">{submission.review_notes ?? "No note yet"}</p>
                </div>
              </div>
            )}

            <form className="grid gap-4" onSubmit={submitKyc}>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="driverVehicleType">Vehicle type</Label>
                  <select
                    id="driverVehicleType"
                    value={form.vehicleType}
                    onChange={(event) => updateField("vehicleType", event.target.value)}
                    className="h-11 rounded-md border bg-background/70 px-3 text-sm"
                    required
                  >
                    {driverTransportationOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="driverVehiclePlate">Plate number</Label>
                  <Input id="driverVehiclePlate" value={form.vehiclePlateNumber} onChange={(event) => updateField("vehiclePlateNumber", event.target.value.toUpperCase())} placeholder="ABC-123XY" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="driverVehicleModel">Vehicle model</Label>
                  <Input id="driverVehicleModel" value={form.vehicleModel} onChange={(event) => updateField("vehicleModel", event.target.value)} placeholder="Honda, Toyota, etc." required />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Government ID</p>
                      <p className="mt-1 text-xs text-muted-foreground">{form.idDocumentUrl ? "Uploaded and ready." : "Upload a clear image under 5 MB."}</p>
                    </div>
                    {form.idDocumentUrl ? <CheckCircle2 className="size-5 text-emerald-500" /> : <UploadCloud className="size-5 text-primary" />}
                  </div>
                  <div className="mt-4">
                    <CloudinaryUpload
                      folder="fly-logistics/driver-kyc"
                      label={form.idDocumentUrl ? "Replace ID" : "Upload ID"}
                      onUploaded={(asset) => updateField("idDocumentUrl", asset.secureUrl)}
                    />
                  </div>
                </div>

                <div className="rounded-md border bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Driver license</p>
                      <p className="mt-1 text-xs text-muted-foreground">{form.licenseUrl ? "Uploaded and ready." : "Upload a clear license image."}</p>
                    </div>
                    {form.licenseUrl ? <CheckCircle2 className="size-5 text-emerald-500" /> : <UploadCloud className="size-5 text-primary" />}
                  </div>
                  <div className="mt-4">
                    <CloudinaryUpload
                      folder="fly-logistics/driver-kyc"
                      label={form.licenseUrl ? "Replace license" : "Upload license"}
                      onUploaded={(asset) => updateField("licenseUrl", asset.secureUrl)}
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={saving} className="w-full sm:w-fit">
                {saving ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                Submit verification
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
