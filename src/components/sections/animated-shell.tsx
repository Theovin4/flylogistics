"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export function AnimatedShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const lines = ref.current.querySelectorAll("[data-route-line]");
    gsap.fromTo(lines, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 1.4, stagger: 0.16, ease: "power3.out" });
  }, []);

  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
