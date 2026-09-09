"use client";

import dynamic from "next/dynamic";

function HeroVisualSkeleton() {
  return (
    <div className="relative h-[340px] min-h-[320px] overflow-hidden rounded-lg border border-border/70 bg-[#030508] sm:h-[460px] lg:h-[520px]">
      <div className="absolute inset-0 grid-field opacity-65" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,122,0,0.18),transparent_28%,rgba(3,5,8,0.82)_58%,rgba(255,122,0,0.1))]" />
      <div className="absolute left-6 right-6 top-6 h-px orange-line" />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-2 sm:left-6 sm:right-6 sm:top-6">
        <div className="glass h-9 w-36 animate-pulse rounded-md" />
        <div className="glass h-9 w-32 animate-pulse rounded-md" />
      </div>
      <div className="absolute inset-x-4 top-20 grid gap-3 sm:inset-x-6 sm:top-24 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="relative h-[220px] overflow-hidden rounded-lg border border-white/10 bg-black/35 sm:h-[300px]">
          <div className="absolute left-4 right-4 top-1/2 h-px animate-pulse bg-primary/40" />
          <div className="absolute left-[18%] top-[64%] size-3 animate-pulse rounded-sm bg-primary" />
          <div className="absolute right-[18%] top-[24%] size-3 animate-pulse rounded-sm bg-primary" />
          <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
            {["ETA guidance", "Route status", "Global lanes"].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-md border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        </div>
        <div className="hidden gap-3 lg:grid">
          {["dispatch", "packages", "hub"].map((item) => (
            <div key={item} className="glass h-24 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
      <div className="absolute bottom-4 left-4 right-4 hidden h-12 animate-pulse rounded-lg border border-primary/20 bg-primary/10 sm:block" />
    </div>
  );
}

const HeroVisual = dynamic(() => import("./hero-visual").then((module) => module.HeroVisual), {
  loading: () => <HeroVisualSkeleton />,
  ssr: false
});

export function LazyHeroVisual() {
  return <HeroVisual />;
}
