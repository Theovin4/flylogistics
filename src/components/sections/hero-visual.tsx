"use client";

import { Activity, ArrowUpRight, Bike, Globe2, MapPin, PackageCheck, Plane, Radar, Route, Ship, Truck, Zap } from "lucide-react";

const activityFeed = [
  { label: "Ikeja pickup secured", value: "2 min", icon: Bike },
  { label: "Abuja linehaul cleared", value: "Live", icon: Truck },
  { label: "Export lane review", value: "Ready", icon: Plane }
];

const metrics = [
  { label: "ETA guidance", value: "Live" },
  { label: "Route status", value: "Reviewed" },
  { label: "Service lanes", value: "Local + global" }
];

const routeNodes = [
  { x: 112, y: 244, label: "LOS" },
  { x: 508, y: 74, label: "LHR" },
  { x: 528, y: 232, label: "ABV" },
  { x: 462, y: 304, label: "ACC" }
];

export function HeroVisual() {
  return (
    <div
      aria-label="Live Fly Logistics operations visual"
      className="relative h-[340px] min-h-[320px] overflow-hidden rounded-lg border border-border/70 bg-[#030508] shadow-[0_32px_120px_rgba(0,0,0,0.38)] sm:h-[460px] lg:h-[520px]"
    >
      <div className="pointer-events-none absolute inset-0 grid-field opacity-65" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,122,0,0.18),transparent_28%,rgba(3,5,8,0.82)_58%,rgba(255,122,0,0.1))]" />
      <div className="pointer-events-none absolute left-6 right-6 top-6 h-px orange-line" />

      <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2 sm:left-6 sm:right-6 sm:top-6">
        <div className="glass flex items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">
          <Radar className="size-4 text-primary" />
          Live command
        </div>
        <div className="glass flex items-center gap-2 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
          <Activity className="size-4" />
          Network stable
        </div>
      </div>

      <div className="absolute inset-x-4 top-20 grid gap-3 sm:inset-x-6 sm:top-24 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="relative h-[220px] overflow-hidden rounded-lg border border-white/10 bg-black/35 sm:h-[300px] lg:h-[300px]">
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Globe2 className="size-4" />
            Global lanes
          </div>

          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 640 360" role="img" aria-label="Animated delivery lanes from Lagos">
            <defs>
              <linearGradient id="hero-lane-orange" x1="0" x2="1" y1="0" y2="0">
                <stop stopColor="#ff7a00" stopOpacity="0.05" />
                <stop offset="0.45" stopColor="#ff7a00" stopOpacity="0.95" />
                <stop offset="1" stopColor="#ffd29a" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="hero-lane-blue" x1="0" x2="1" y1="0" y2="0">
                <stop stopColor="#38bdf8" stopOpacity="0.05" />
                <stop offset="0.55" stopColor="#38bdf8" stopOpacity="0.72" />
                <stop offset="1" stopColor="#ff7a00" stopOpacity="0.65" />
              </linearGradient>
            </defs>
            <path className="hero-route hero-route-a" d="M112 244 C 202 126, 316 106, 508 74" stroke="url(#hero-lane-orange)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path className="hero-route hero-route-b" d="M112 244 C 246 246, 340 206, 528 232" stroke="url(#hero-lane-blue)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path className="hero-route hero-route-c" d="M112 244 C 174 292, 274 316, 462 304" stroke="url(#hero-lane-orange)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M72 284 L168 118 L304 72 L476 112 L574 214 L512 304 L352 332 L194 312 Z" stroke="rgba(255,255,255,0.09)" strokeWidth="1" fill="rgba(255,122,0,0.045)" />
            {routeNodes.map((node) => (
              <g key={node.label}>
                <circle className="hero-pulse-node" cx={node.x} cy={node.y} r="10" fill="rgba(255,122,0,0.18)" />
                <circle cx={node.x} cy={node.y} r="4" fill="#ff7a00" />
                <text x={node.x + 14} y={node.y + 5} fill="rgba(255,255,255,0.72)" fontSize="14" fontWeight="700" letterSpacing="2">
                  {node.label}
                </text>
              </g>
            ))}
          </svg>

          <div className="hero-vehicle hero-vehicle-a">
            <Bike className="size-5" />
          </div>
          <div className="hero-vehicle hero-vehicle-b">
            <Truck className="size-5" />
          </div>
          <div className="hero-vehicle hero-vehicle-c">
            <Plane className="size-5" />
          </div>

          <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-sm font-black text-white sm:text-base">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden gap-3 lg:grid">
          <div className="glass rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">AI dispatch</p>
                <h3 className="mt-2 text-xl font-black text-white">Smart load board</h3>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
                <Zap className="size-5" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {activityFeed.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <item.icon className="size-4 shrink-0 text-primary" />
                    <span className="truncate text-sm font-semibold text-white/85">{item.label}</span>
                  </div>
                  <span className="shrink-0 rounded border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-lg p-4">
              <PackageCheck className="size-5 text-primary" />
              <p className="mt-3 text-2xl font-black text-white">Trackable</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Shipment updates</p>
            </div>
            <div className="glass rounded-lg p-4">
              <Ship className="size-5 text-primary" />
              <p className="mt-3 text-2xl font-black text-white">Cargo</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Import and export support</p>
            </div>
          </div>

          <div className="glass flex items-center justify-between gap-3 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
                <MapPin className="size-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Lagos operations hub</p>
                <p className="text-xs text-muted-foreground">Local, interstate, import, export</p>
              </div>
            </div>
            <ArrowUpRight className="size-5 text-primary" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 hidden items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-semibold text-primary backdrop-blur-md sm:flex">
        <div className="flex items-center gap-2">
          <Route className="size-4" />
          Route review active across delivery lanes
        </div>
        <span className="text-white/70">Updated now</span>
      </div>
    </div>
  );
}
