import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-3", className)} aria-label="Fly Logistics home">
      <span className="relative grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary/10 shadow-[0_0_34px_color-mix(in_oklch,var(--primary)_35%,transparent)]">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="size-7">
          <defs>
            <linearGradient id="flyLogoGradient" x1="10" x2="58" y1="8" y2="58">
              <stop stopColor="#fff4dc" />
              <stop offset="0.38" stopColor="#ff9f1c" />
              <stop offset="1" stopColor="#ff4d00" />
            </linearGradient>
          </defs>
          <path d="M12 50 28 10h28L43 22H31l-4 10h20L35 44H23l-3 6H12Z" fill="url(#flyLogoGradient)" />
          <path d="M38 17c7 2 12 6 16 13-7-3-13-3-20-1l4-12Z" fill="#fff" opacity="0.78" />
          <path d="M8 38c10-7 23-9 38-6" fill="none" stroke="#ff9f1c" strokeLinecap="round" strokeWidth="3" />
        </svg>
      </span>
      {!markOnly && (
        <span className="flex flex-col leading-none">
          <span className="text-base font-bold tracking-normal">Fly Logistics</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">AI Freight OS</span>
        </span>
      )}
    </Link>
  );
}
