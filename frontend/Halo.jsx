import { useMemo } from "react";
import { toXYZ } from "./utils";

export default function Halo({ planet, texture }) {
  const pos = useMemo(() => new Float32Array(toXYZ(planet.ra, planet.dec)), [planet]);
  return (
    <points key={planet.pl_name} renderOrder={0} frustumCulled={false} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        alphaTest={0.5}
        transparent
        color="#ffffff"
        size={30}
        sizeAttenuation={false}
        depthTest={false}
      />
    </points>
  );
}