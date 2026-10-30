import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

const MIN_FOV = 8;
const MAX_FOV = 75;
const clamp = (v) => Math.min(MAX_FOV, Math.max(MIN_FOV, v));

export default function Zoom({ api, controlsRef }) {
  const { camera, gl, raycaster } = useThree();
  const target = useRef(camera.fov);

  useEffect(() => {
    api.current = {
      zoomBy: (factor) => (target.current = clamp(target.current * factor)),
      set: (fov) => (target.current = clamp(fov)),
      get: () => target.current,
    };
    const el = gl.domElement;
    const onWheel = (e) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.01 : 0.0015; // trackpad pinch vs scroll wheel
      target.current = clamp(target.current * Math.exp(e.deltaY * k));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [api, gl]);

  useFrame((_, delta) => {
    const next = camera.fov + (target.current - camera.fov) * (1 - Math.exp(-delta * 10));
    if (Math.abs(next - camera.fov) > 0.001) {
      camera.fov = next;
      camera.updateProjectionMatrix();
    }
    const s = camera.fov / 60;
    if (controlsRef.current) {
      controlsRef.current.rotateSpeed = -0.35 * s;
      controlsRef.current.autoRotateSpeed = 0.3 * s;
    }
    raycaster.params.Points.threshold = 0.5 * s;
  });

  return null;
}