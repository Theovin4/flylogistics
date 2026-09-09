import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 touch-manipulation select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-[0.01em] outline-none transition-[background,color,border-color,box-shadow,filter,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.985] disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-primary/60 bg-primary text-primary-foreground shadow-[0_12px_34px_color-mix(in_oklch,var(--primary)_28%,transparent)] hover:-translate-y-px hover:brightness-110",
        secondary: "border border-border/70 bg-secondary text-secondary-foreground shadow-sm hover:-translate-y-px hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        outline: "border border-border bg-background/70 shadow-sm backdrop-blur hover:-translate-y-px hover:border-primary/45 hover:bg-accent/70",
        destructive: "border border-destructive/60 bg-destructive text-white shadow-[0_12px_34px_color-mix(in_oklch,var(--destructive)_22%,transparent)] hover:-translate-y-px hover:brightness-110"
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-10 px-3",
        lg: "h-12 px-6 text-base",
        icon: "size-11 p-0"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
