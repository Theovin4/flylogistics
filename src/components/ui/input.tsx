import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      data-fly-input=""
      className={cn(
        "flex h-11 w-full min-w-0 touch-manipulation rounded-md border border-input bg-background/75 px-3 py-2 text-base shadow-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm",
        className
      )}
      {...props}
    />
  );
}
