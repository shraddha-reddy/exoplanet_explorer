import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

export default function Nebula() {
  const matRef = useRef();
  const { camera } = useThree();

  const texture = useMemo(() => {
    const W = 2048;
    const H = 1024;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#02030a";
    ctx.fillRect(0, 0, W, H);

    let s = 12345;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    const palette = ["90,110,255", "160,90,220", "255,170,120", "80,170,255"];
    ctx.globalCompositeOperation = "lighter";

    // big, soft clouds along a wavy band (bigger and fewer than before, so less banding)
    for (let i = 0; i < 450; i++) {
      const x = rnd() * W;
      const bandY = H / 2 + Math.sin((x / W) * Math.PI * 2) * H * 0.12;
      const y = bandY + (rnd() + rnd() + rnd() - 1.5) * H * 0.18;
      const r = 50 + rnd() * 130;
      const col = palette[Math.floor(rnd() * palette.length)];
      const a = 0.03 + rnd() * 0.04;
      for (const dx of [-W, 0, W]) {
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        g.addColorStop(0, `rgba(${col},${a})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);

  // fade the backdrop out as the view zooms in
  useFrame(() => {
    if (!matRef.current) return;
    const k = Math.min(1, Math.max(0, (camera.fov - 8) / 40)); // 0 = fully zoomed in, 1 = zoomed out
    matRef.current.opacity = 0.12 + 0.88 * k;
  });

  return (
    <mesh renderOrder={-10} raycast={() => null}>
      <sphereGeometry args={[400, 64, 32]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        transparent
        fog={false}
      />
    </mesh>
  );
}