import * as THREE from "three";

export const API = "http://127.0.0.1:8000";
const R = 50;

export function toXYZ(raDeg, decDeg) {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return [
    R * Math.cos(dec) * Math.cos(ra),
    R * Math.sin(dec),
    -R * Math.cos(dec) * Math.sin(ra),
  ];
}

export function colorFor(hz) {
  if (hz === "In habitable zone") return "#4ade80";
  if (hz === "Too hot") return "#fb923c";
  if (hz === "Too cold") return "#60a5fa";
  return "#cbd5e1";
}

export function planetLabel(p) {
  if (p.hostname && p.pl_name.startsWith(p.hostname)) {
    const rest = p.pl_name.slice(p.hostname.length).trim();
    return rest || p.pl_name;
  }
  return p.pl_name;
}

export function makeCircleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  return new THREE.CanvasTexture(c);
}