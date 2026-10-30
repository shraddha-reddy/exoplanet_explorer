import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { toXYZ, colorFor } from "./utils";

export default function Dots({ list, size, texture, onSelect, onHover }) {
  const matRef = useRef();

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(list.length * 3);
    const colors = new Float32Array(list.length * 3);
    const col = new THREE.Color();
    list.forEach((p, i) => {
      positions.set(toXYZ(p.ra, p.dec), i * 3);
      col.set(colorFor(p.hz_status));
      colors.set([col.r, col.g, col.b], i * 3);
    });
    return { positions, colors };
  }, [list]);

  // dots grow a little as you zoom in, so zooming feels like getting closer
  useFrame(({ camera }) => {
    if (!matRef.current) return;
    const grow = Math.min(1.8, Math.max(1, Math.pow(60 / camera.fov, 0.4)));
    matRef.current.size = size * grow;
  });

  if (!list.length) return null;

  return (
    <points
      key={list.length + "-" + list[0].pl_name}
      renderOrder={size > 12 ? 2 : 1}
      frustumCulled={false}
      onClick={(e) => {
        e.stopPropagation();
        const p = list[e.index];
        if (p) onSelect(p);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onHover?.(list[e.index] ?? null, e.nativeEvent);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
        onHover?.(null);
      }}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        map={texture}
        alphaTest={0.5}
        transparent
        vertexColors
        size={size}
        sizeAttenuation={false}
        depthTest={false}
      />
    </points>
  );
}