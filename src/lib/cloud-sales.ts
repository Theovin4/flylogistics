export const cloudLeadStatuses = [
  "new",
  "contacted",
  "demo_scheduled",
  "demo_completed",
  "proposal_sent",
  "negotiating",
  "won",
  "lost"
] as const;

export type CloudLeadStatus = (typeof cloudLeadStatuses)[number];

export const cloudLeadStatusLabels: Record<CloudLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  demo_scheduled: "Demo Scheduled",
  demo_completed: "Demo Completed",
  proposal_sent: "Proposal Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost"
};

export function normalizeCloudLeadStatus(value: unknown): CloudLeadStatus {
  const normalized = String(value ?? "new").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return cloudLeadStatuses.includes(normalized as CloudLeadStatus) ? normalized as CloudLeadStatus : "new";
}
