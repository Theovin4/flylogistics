import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex min-w-fit shrink-0 items-center gap-3", className)} aria-label={markOnly ? "Fly Logistics home" : undefined}>
      <span className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-primary/30 shadow-[0_0_34px_color-mix(in_oklch,var(--primary)_35%,transparent)]">
        <Image src="/logo.svg" alt="" fill sizes="44px" className="object-cover" priority />
      </span>
      {!markOnly && (
        <span className="flex min-w-fit flex-col leading-none">
          <span className="whitespace-nowrap text-lg font-black tracking-normal text-foreground">Fly Logistics</span>
          <span className="mt-1 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.24em] text-primary sm:tracking-[0.28em]">
            AI Freight OS
          </span>
        </span>
      )}
    </Link>
  );
}
