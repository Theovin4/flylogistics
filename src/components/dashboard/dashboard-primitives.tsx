"use client";

import Link from "next/link";
import type { Route as NextRoute } from "next";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardSectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function DashboardSectionHeader({ eyebrow, title, description, action, className }: DashboardSectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <Badge className="mb-3 border-primary/40 bg-primary/10 text-primary">{eyebrow}</Badge> : null}
        <h1 className="text-2xl font-black tracking-normal text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type DashboardStatCardProps = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  helper?: string;
  tone?: "default" | "success" | "warning" | "danger";
  compact?: boolean;
};

const toneClass = {
  default: "text-primary",
  success: "text-emerald-500",
  warning: "text-amber-500",
  danger: "text-destructive"
} as const;

export function DashboardStatCard({ label, value, icon: Icon, helper, tone = "default", compact = false }: DashboardStatCardProps) {
  return (
    <Card className="glass border-border/70 shadow-sm">
      <CardHeader className={cn("flex-row items-center justify-between gap-3", compact ? "p-4 pb-2" : "pb-3")}>
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</CardTitle>
        {Icon ? <Icon className={cn("size-4", toneClass[tone])} /> : null}
      </CardHeader>
      <CardContent className={cn(compact ? "p-4 pt-0" : "pt-0")}>
        <div className={cn("font-mono font-black text-foreground", compact ? "text-2xl" : "text-3xl")}>{value}</div>
        {helper ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

type DashboardQuickAction = {
  label: string;
  href: string;
  icon?: LucideIcon;
  onClick?: () => void;
};

type DashboardQuickActionsProps = {
  title: string;
  description?: string;
  actions: readonly DashboardQuickAction[];
};

export function DashboardQuickActions({ title, description, actions }: DashboardQuickActionsProps) {
  return (
    <Card className="glass border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon ?? ArrowRight;
          return (
            <Link
              key={`${action.href}-${action.label}`}
              href={action.href as NextRoute}
              onClick={action.onClick}
              className="group flex items-center justify-between gap-3 rounded-md border bg-background/45 px-3 py-3 text-sm font-semibold transition hover:border-primary/40 hover:bg-primary/10"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="size-4 shrink-0 text-primary" />
                <span className="truncate">{action.label}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

type DashboardNavItem<TSection extends string> = {
  label: string;
  href: string;
  icon: LucideIcon;
  section: TSection;
};

type DashboardNavGroupProps<TSection extends string> = {
  title: string;
  items: readonly DashboardNavItem<TSection>[];
  active: TSection;
  onNavigate?: (section: TSection) => void;
};

export function DashboardNavGroup<TSection extends string>({ title, items, active, onNavigate }: DashboardNavGroupProps<TSection>) {
  return (
    <div className="grid gap-2">
      <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
      <div className="grid gap-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href as NextRoute}
            onClick={() => onNavigate?.(item.section)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition",
              item.section === active ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
