import { useMemo } from "react";
import * as THREE from "three";
import { toXYZ, colorFor } from "./utils";

export default function Dots({ list, size, texture, onSelect }) {
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
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
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