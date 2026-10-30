import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { toXYZ } from "./utils";

export default function FlyTo({ target, controlsRef }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!target) return;
    const [x, y, z] = toXYZ(target.ra, target.dec);
    // the camera sits on the opposite side of the origin, so it looks toward the planet
    const pos = new THREE.Vector3(-x, -y, -z).normalize().multiplyScalar(0.1);
    camera.position.copy(pos);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.update();
  }, [target, camera, controlsRef]);

  return null;
}