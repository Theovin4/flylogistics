import { Bell, Camera, CheckCircle2, CreditCard, DatabaseBackup, GitBranch, PackagePlus, Route, ShieldCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const workflows = [
  { icon: PackagePlus, title: "Quote to shipment", detail: "Convert approved quotes into trackable shipments." },
  { icon: Truck, title: "Assign driver", detail: "Assign deliveries manually or review a dispatch suggestion." },
  { icon: Bell, title: "Notify customer", detail: "Send clear updates when shipment status changes." },
  { icon: Camera, title: "Complete delivery", detail: "Upload private proof and close the shipment." }
] as const;

const checklist = [
  { icon: ShieldCheck, label: "Admin actions require server-side role checks, validation, and throttling" },
  { icon: DatabaseBackup, label: "Operations storage includes access policies, indexes, audit logs, and realtime tables" },
  { icon: CreditCard, label: "Payment verification is server-side and webhook-ready" },
  { icon: GitBranch, label: "Code, environment settings, media assets, and operational events are documented" }
] as const;

export function AdminOperationsPanel() {
  return (
    <section className="mt-8 grid gap-4">
      <div>
        <Badge className="border-primary/40 bg-primary/10 text-primary">Operations</Badge>
        <h2 className="mt-3 text-2xl font-black tracking-normal sm:text-3xl">Operations workflows</h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="size-5 text-primary" />
              Workflow map
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {workflows.map((workflow, index) => (
              <div key={workflow.title} className="flex gap-3 rounded-md border bg-background/40 p-4 text-sm">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                  <workflow.icon className="size-4" />
                </div>
                <div>
                  <div className="font-semibold">{index + 1}. {workflow.title}</div>
                  <div className="mt-1 text-muted-foreground">{workflow.detail}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              Readiness checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {checklist.map((item) => (
              <div key={item.label} className="flex gap-3 rounded-md border bg-background/40 p-3 text-sm">
                <item.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
