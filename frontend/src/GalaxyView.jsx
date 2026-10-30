import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Stars, Line } from "@react-three/drei";
import { colorFor, toXYZ } from "./utils";

const LY_PER_PC = 3.2616;

// Logarithmic distance scale so 10 ly and 10,000 ly are both visible.
const radiusOf = (ly) => 6 * Math.log10(1 + ly / 10);

// Direction from the Sun comes from RA/Dec; radius comes from distance.
// toXYZ uses a radius of 50, so divide by 50 to get a unit direction.
function dirOf(ra, dec) {
  const [x, y, z] = toXYZ(ra, dec);
  return [x / 50, y / 50, z / 50];
}

function posOf(p) {
  const [x, y, z] = dirOf(p.ra, p.dec);
  const r = radiusOf((p.sy_dist ?? 0) * LY_PER_PC);
  return [x * r, y * r, z * r];
}

// The Milky Way's plane: its north pole is at RA 192.859°, Dec +27.128°.
const GAL_NORMAL = new THREE.Vector3(...dirOf(192.859, 27.128));
const GAL_QUAT = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), GAL_NORMAL);

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.8)");
  g.addColorStop(0.6, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeDiscTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(140,150,255,0.22)");
  g.addColorStop(0.5, "rgba(110,120,230,0.10)");
  g.addColorStop(1, "rgba(80,90,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function GalaxyDots({ list, size, opacity, glow, onSelect, onHover }) {
  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(list.length * 3);
    const colors = new Float32Array(list.length * 3);
    const col = new THREE.Color();
    list.forEach((p, i) => {
      positions.set(posOf(p), i * 3);
      col.set(colorFor(p.hz_status));
      colors.set([col.r, col.g, col.b], i * 3);
    });
    return { positions, colors };
  }, [list]);

  if (!list.length) return null;

  return (
    <points
      key={list.length + "-" + list[0].pl_name}
      renderOrder={size > 10 ? 3 : 2}
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
        map={glow}
        transparent
        opacity={opacity}
        vertexColors
        size={size}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Camera starts at Earth and pulls out to a view of the whole neighbourhood.
const START = new THREE.Vector3(0, 0.2, 0.6);
const END = new THREE.Vector3(0, 20, 36);

function PullOut() {
  const { camera, controls } = useThree();
  const t = useRef(0);

  useEffect(() => {
    t.current = 0;
    camera.position.copy(START);
  }, [camera]);

  useFrame((_, delta) => {
    if (t.current >= 1) return;
    t.current = Math.min(1, t.current + delta / 3);
    const e = 1 - Math.pow(1 - t.current, 3);
    camera.position.lerpVectors(START, END, e);
    camera.lookAt(0, 0, 0);
    if (controls && controls.update) controls.update();
  });

  return null;
}

const labelStyle = {
  color: "#aab6dd",
  fontSize: 12,
  whiteSpace: "nowrap",
  pointerEvents: "none",
};

// zIndexRange keeps these labels underneath the side panel and buttons
const Z = [0, 0];

const RINGS = [
  { ly: 10, label: "10 ly" },
  { ly: 100, label: "100 ly" },
  { ly: 1000, label: "1,000 ly" },
  { ly: 10000, label: "10,000 ly" },
];

export default function GalaxyView({ planets, selected, onSelect, onHover }) {
  const controlsRef = useRef(null);
  const glow = useMemo(() => makeGlowTexture(), []);
  const disc = useMemo(() => makeDiscTexture(), []);

  const habitable = useMemo(
    () => planets.filter((p) => p.hz_status === "In habitable zone" && p.sy_dist != null),
    [planets]
  );
  const others = useMemo(
    () => planets.filter((p) => p.hz_status !== "In habitable zone" && p.sy_dist != null),
    [planets]
  );

  const selPos = selected && selected.sy_dist != null ? posOf(selected) : null;
  const gc = dirOf(266.4, -29).map((v) => v * 22); // direction of the galactic centre
  const kep = dirOf(290.7, 44.5).map((v) => v * radiusOf(1500));

  function recentre() {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(0, 0, 0);
    c.object.position.copy(END);
    c.update();
  }

  return (
    <>
      <button
        type="button"
        onClick={recentre}
        style={{
          position: "fixed",
          zIndex: 20,
          bottom: 70,
          left: 16,
          width: "auto",
          marginTop: 0,
          padding: "8px 14px",
          fontSize: 12,
          borderRadius: 10,
          border: "1px solid #26335f",
          background: "#0b1020ee",
          color: "#e2e8f0",
          cursor: "pointer",
        }}
      >
        Re-centre on Sun
      </button>

      <Canvas
        camera={{ position: [0, 0.2, 0.6], fov: 60, near: 0.01, far: 2000 }}
        raycaster={{ params: { Points: { threshold: 0.3 } } }}
        onPointerMissed={() => onSelect(null)}
      >
        <Stars radius={300} depth={80} count={3000} factor={5} fade />

        {/* the Milky Way's real plane: a faint disc with distance rings */}
        <group quaternion={GAL_QUAT}>
          <mesh raycast={() => null} renderOrder={-5}>
            <circleGeometry args={[24, 96]} />
            <meshBasicMaterial
              map={disc}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          {RINGS.map((r) => {
            const rad = radiusOf(r.ly);
            return (
              <group key={r.ly}>
                <mesh raycast={() => null}>
                  <ringGeometry args={[rad - 0.02, rad + 0.02, 128]} />
                  <meshBasicMaterial color="#4a5a9a" transparent opacity={0.5} side={THREE.DoubleSide} />
                </mesh>
                <Html position={[rad, 0, 0]} center zIndexRange={Z} style={labelStyle}>
                  {r.label}
                </Html>
              </group>
            );
          })}
        </group>

        {/* the Sun, centre of the map */}
        <mesh raycast={() => null}>
          <sphereGeometry args={[0.22, 32, 32]} />
          <meshBasicMaterial color="#ffe3a3" />
        </mesh>
        <mesh raycast={() => null}>
          <sphereGeometry args={[0.55, 32, 32]} />
          <meshBasicMaterial
            color="#ffd27a"
            transparent
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.BackSide}
          />
        </mesh>
        <Html position={[0, -0.8, 0]} center zIndexRange={Z} style={{ ...labelStyle, color: "#ffd27a" }}>
          Sun (you are here)
        </Html>

        <Html position={kep} center zIndexRange={Z} style={{ ...labelStyle, color: "#fb923c" }}>
          Kepler field
        </Html>
        <Html position={gc} center zIndexRange={Z} style={labelStyle}>
          ← toward galactic centre
        </Html>

        <GalaxyDots list={others} size={9} opacity={0.75} glow={glow} onSelect={onSelect} onHover={onHover} />
        <GalaxyDots list={habitable} size={16} opacity={1} glow={glow} onSelect={onSelect} onHover={onHover} />

        {selPos && (
          <>
            <Line points={[[0, 0, 0], selPos]} color="#ffffff" lineWidth={1} transparent opacity={0.45} />
            <mesh position={selPos} raycast={() => null}>
              <sphereGeometry args={[0.35, 24, 24]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.35}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </>
        )}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          zoomToCursor
          minDistance={1}
          maxDistance={120}
          autoRotate={!selected}
          autoRotateSpeed={0.4}
        />
        <PullOut />
      </Canvas>
    </>
  );
}