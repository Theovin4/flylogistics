import type { ReactNode } from "react";

export function AnimatedShell({ children }: { children: ReactNode }) {
  return <div className="landing-shell">{children}</div>;
}
