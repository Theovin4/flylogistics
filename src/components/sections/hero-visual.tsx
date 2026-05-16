"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function CargoCore() {
  const mesh = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (mesh.current) {
      mesh.current.rotation.x += delta * 0.22;
      mesh.current.rotation.y += delta * 0.36;
    }
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.5, 1]} />
      <meshStandardMaterial color="#ff9f1c" metalness={0.72} roughness={0.18} />
    </mesh>
  );
}

export function HeroVisual() {
  return (
    <div className="relative h-[360px] min-h-[320px] overflow-hidden rounded-lg border border-border/70 bg-black/90 sm:h-[480px]">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[2, 2, 3]} intensity={4} color="#ff9f1c" />
        <CargoCore />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 grid-field opacity-70" />
      <div className="pointer-events-none absolute left-6 right-6 top-6 h-px orange-line" />
      <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-3">
        {["ETA confidence 97%", "Routes optimized 12,084", "Carbon saved 18.6t"].map((item) => (
          <div key={item} className="glass rounded-md px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/85">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
