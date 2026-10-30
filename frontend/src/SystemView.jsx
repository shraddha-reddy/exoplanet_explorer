import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Stars, Trail } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

const SUGGESTIONS = [
  "Could life exist here?",
  "How does it compare to Earth?",
  "What makes this system special?",
];

const orbitOf = (i) => 2.5 + i * 1.6; // evenly spaced for readability, not to scale

/* ---------- helpers ---------- */

function colorFor(hz) {
  if (hz === "In habitable zone") return "#4ade80";
  if (hz === "Too hot") return "#fb923c";
  if (hz === "Too cold") return "#60a5fa";
  return "#cbd5e1";
}

function starColor(teff) {
  if (teff == null) return "#ffd27a";
  if (teff < 3700) return "#ff8a5c";
  if (teff < 5200) return "#ffb36b";
  if (teff < 6000) return "#ffd27a";
  if (teff < 7500) return "#fff4d6";
  return "#cfe0ff";
}

function starLabel(teff) {
  if (teff == null) return "Star type unknown";
  if (teff < 3700) return "Cool red dwarf";
  if (teff < 5200) return "Orange dwarf";
  if (teff < 6000) return "Sun-like star";
  if (teff < 7500) return "Hot yellow-white star";
  return "Hot blue-white star";
}

function shortName(p, hostname) {
  if (p.pl_name.startsWith(hostname)) {
    const rest = p.pl_name.slice(hostname.length).trim();
    return rest || p.pl_name;
  }
  return p.pl_name;
}

// seeded random so a planet always gets the same look
function makeRng(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  "Earth-sized": { base: "#5b7a8c", colors: ["#6f8f5a", "#8b8466", "#dfe7ec"] },
  "Super-Earth": { base: "#8c6a52", colors: ["#6b4b3a", "#a88566", "#c9b79a"] },
  "Neptune-like": { bands: true, base: "#3d6db5", colors: ["#2f58a0", "#5b8fd6", "#7fb0e8"] },
  "Gas giant": { bands: true, base: "#c9a36b", colors: ["#b0824a", "#e0c18f", "#9a6b3d", "#d9b27a"] },
};

function makePlanetTexture(type, name) {
  const rand = makeRng(name);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  const pal = PALETTES[type] || PALETTES["Earth-sized"];
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, 512, 256);
  if (pal.bands) {
    let y = 0;
    while (y < 256) {
      const h = 8 + rand() * 28;
      ctx.fillStyle = pal.colors[Math.floor(rand() * pal.colors.length)];
      ctx.globalAlpha = 0.55 + rand() * 0.35;
      ctx.fillRect(0, y, 512, h);
      y += h;
    }
  } else {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = pal.colors[Math.floor(rand() * pal.colors.length)];
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      ctx.beginPath();
      ctx.ellipse(rand() * 512, rand() * 256, 10 + rand() * 50, 6 + rand() * 30, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Where to draw the habitable-zone band, using each planet's hz_status.
// Schematic only: orbits are evenly spaced, not to scale.
function computeBand(planets) {
  const idx = (s) => planets.map((p, i) => (p.hz_status === s ? i : -1)).filter((i) => i >= 0);
  const hz = idx("In habitable zone");
  const hot = idx("Too hot");
  const cold = idx("Too cold");
  let inner, outer;
  if (hz.length) {
    inner = orbitOf(Math.min(...hz)) - 0.7;
    outer = orbitOf(Math.max(...hz)) + 0.7;
  } else if (hot.length && cold.length) {
    const a = orbitOf(Math.max(...hot));
    const b = orbitOf(Math.min(...cold));
    if (a >= b) return null;
    const mid = (a + b) / 2;
    inner = Math.max(a + 0.2, mid - 0.6);
    outer = Math.min(b - 0.2, mid + 0.6);
  } else if (hot.length) {
    inner = orbitOf(Math.max(...hot)) + 0.5;
    outer = inner + 1.2;
  } else if (cold.length) {
    outer = orbitOf(Math.min(...cold)) - 0.5;
    inner = outer - 1.2;
  } else return null;
  inner = Math.max(inner, 1.8);
  return inner < outer ? { inner, outer } : null;
}

/* ---------- 3D pieces ---------- */

function Star({ color, radius }) {
  const glow = useRef();
  const hot = useMemo(() => new THREE.Color(color).multiplyScalar(1.7), [color]);

  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.getElapsedTime() * 1.5) * 0.03;
    if (glow.current) glow.current.scale.setScalar(s);
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color={hot} toneMapped={false} />
      </mesh>
      <group ref={glow}>
        <mesh>
          <sphereGeometry args={[radius * 1.25, 48, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
        </mesh>
        <mesh>
          <sphereGeometry args={[radius * 1.7, 48, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
        </mesh>
      </group>
      <pointLight color={color} intensity={120} />
    </group>
  );
}

function HabitableBand({ band }) {
  if (!band) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <ringGeometry args={[band.inner, band.outer, 128]} />
      <meshBasicMaterial color="#4ade80" transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Orbiter({ planet, index, hostname, paused, selected, onSelect }) {
  const ref = useRef();
  const angle = useRef(index * 1.7);
  const [hovered, setHovered] = useState(false);

  const orbit = orbitOf(index);
  const period = Math.max(planet.pl_orbper ?? 100, 0.5);
  const speed = 1.2 / Math.pow(period, 0.4);
  const size = Math.min(0.6, Math.max(0.12, Math.cbrt(planet.pl_rade ?? 1) * 0.14));
  const col = colorFor(planet.hz_status);
  const inHz = planet.hz_status === "In habitable zone";
  const active = selected || hovered;
  const texture = useMemo(() => makePlanetTexture(planet.type, planet.pl_name), [planet.type, planet.pl_name]);

  useFrame((_, delta) => {
    if (!paused) angle.current += delta * speed;
    if (!ref.current) return;
    ref.current.position.set(Math.cos(angle.current) * orbit, 0, Math.sin(angle.current) * orbit);
    ref.current.rotation.y += delta * 0.5; // planet spin
    ref.current.scale.setScalar(active ? 1.3 : 1);
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[orbit - (inHz ? 0.03 : 0.015), orbit + (inHz ? 0.03 : 0.015), 128]} />
        <meshBasicMaterial
          color={inHz ? "#4ade80" : "#3b4a7a"}
          transparent
          opacity={inHz ? (selected ? 1 : 0.7) : selected ? 1 : 0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Trail width={size * 1.6} length={7} color={col} attenuation={(t) => t * t} decay={1.2}>
        <mesh
          ref={ref}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(planet);
          }}
          onPointerOver={() => {
            setHovered(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHovered(false);
            document.body.style.cursor = "auto";
          }}
        >
          <sphereGeometry args={[size, 40, 40]} />
          <meshStandardMaterial map={texture} roughness={0.85} emissive={col} emissiveIntensity={active ? 0.25 : 0.06} />
          {/* atmosphere glow, coloured by habitability status */}
          <mesh>
            <sphereGeometry args={[size * 1.2, 32, 32]} />
            <meshBasicMaterial color={col} transparent opacity={active ? 0.5 : 0.28} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
          </mesh>
          <Html center distanceFactor={12} style={{ pointerEvents: "none" }}>
            <div
              style={{
                color: active ? "#ffffff" : "#aab6dd",
                fontSize: active ? 14 : 12,
                fontWeight: active ? 700 : 400,
                marginTop: 34,
                whiteSpace: "nowrap",
              }}
            >
              {active ? planet.pl_name : shortName(planet, hostname)}
            </div>
          </Html>
        </mesh>
      </Trail>
    </>
  );
}

const INTRO_START = new THREE.Vector3(0, 45, 70);
const INTRO_END = new THREE.Vector3(0, 9, 15);

function CameraIntro({ ready }) {
  const { camera, controls } = useThree();
  const t = useRef(0);

  useEffect(() => {
    t.current = 0;
    camera.position.copy(INTRO_START);
  }, [ready, camera]);

  useFrame((_, delta) => {
    if (!ready || t.current >= 1) return;
    t.current = Math.min(1, t.current + delta / 2.2);
    const e = 1 - Math.pow(1 - t.current, 3); // ease-out
    camera.position.lerpVectors(INTRO_START, INTRO_END, e);
    camera.lookAt(0, 0, 0);
    if (controls && controls.update) controls.update();
  });

  return null;
}

/* ---------- side panel pieces ---------- */

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "#8d9ac7" }}>{k}</span>
      <span style={{ textAlign: "right" }}>{v}</span>
    </div>
  );
}

function SizeCompare({ radius, color }) {
  if (radius == null) return null;
  const earth = 14;
  const d = Math.min(90, Math.max(5, earth * radius));
  return (
    <div style={{ margin: "10px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: earth, height: earth, borderRadius: "50%", background: "#4f8fd6", margin: "0 auto" }} />
          <div style={{ fontSize: 11, color: "#8d9ac7", marginTop: 4 }}>Earth</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: d, height: d, borderRadius: "50%", background: color, margin: "0 auto" }} />
          <div style={{ fontSize: 11, color: "#8d9ac7", marginTop: 4 }}>{radius.toFixed(1)}× Earth's radius</div>
        </div>
      </div>
    </div>
  );
}

function AskBox({ api, names, label }) {
  const key = names.join("|");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuestion("");
    setReply("");
  }, [key]);

  async function send(text) {
    const message = text.trim();
    if (!message || !names.length) return;
    setLoading(true);
    setReply("");
    try {
      const res = await fetch(`${api}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, planets: names }),
      });
      const data = await res.json();
      setReply(res.ok ? data.reply : `Error: ${data.detail || res.status}`);
    } catch (err) {
      setReply(`Could not reach the backend: ${err.message}`);
    }
    setLoading(false);
  }

  const chipStyle = {
    width: "auto",
    marginTop: 0,
    padding: "5px 10px",
    fontSize: 12,
    borderRadius: 999,
    border: "1px solid #3b4a7a",
    background: "#141b38",
    color: "#cbd5e1",
    cursor: "pointer",
  };

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid #26335f", paddingTop: 12 }}>
      <div style={{ color: "#8d9ac7", fontSize: 13, marginBottom: 8 }}>Ask the astronomer about {label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            style={chipStyle}
            onClick={() => {
              setQuestion(s);
              send(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Type your own question..." />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
      {reply && <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{reply}</div>}
    </div>
  );
}

/* ---------- main component ---------- */

export default function SystemView({ api, hostname, initialPlanet, onBack }) {
  const [planets, setPlanets] = useState([]);
  const [picked, setPicked] = useState(initialPlanet ?? null);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState("Loading system...");

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ q: hostname, limit: "50" });
        const res = await fetch(`${api}/planets?${params}`);
        const data = await res.json();
        const list = (Array.isArray(data) ? data : [])
          .filter((p) => p.hostname === hostname)
          .sort((a, b) => (a.pl_orbper ?? 1e9) - (b.pl_orbper ?? 1e9));
        setPlanets(list);
        setStatus(list.length ? "" : "No planets found for this star");
      } catch {
        setStatus("Backend not reachable");
      }
    })();
  }, [api, hostname]);

  const first = planets[0];
  const teff = first?.st_teff;
  const color = starColor(teff);
  const starRadius = Math.min(1.4, Math.max(0.6, Math.cbrt(first?.st_rad ?? 1)));
  const hzCount = planets.filter((p) => p.hz_status === "In habitable zone").length;
  const band = useMemo(() => computeBand(planets), [planets]);

  const askNames = picked ? [picked.pl_name] : planets.map((p) => p.pl_name);
  const askLabel = picked ? picked.pl_name : `the ${hostname} system`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <div style={{ position: "absolute", zIndex: 10, top: 16, left: 16, color: "white" }}>
        <button onClick={onBack}>← Back to sky</button>
        <div style={{ marginTop: 8, fontWeight: 600 }}>{hostname}</div>
        <div style={{ color: "#8d9ac7", fontSize: 13 }}>
          {status || `${planets.length} planet${planets.length === 1 ? "" : "s"} · orbits not to scale`}
        </div>
        {band && (
          <div style={{ color: "#4ade80", fontSize: 12, marginTop: 6 }}>▇ Green band = habitable zone (schematic)</div>
        )}
        <button onClick={() => setPaused((v) => !v)} style={{ width: "auto", marginTop: 10, padding: "6px 12px", background: "#26335f" }}>
          {paused ? "▶ Play orbits" : "⏸ Pause orbits"}
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          zIndex: 10,
          top: 16,
          right: 16,
          width: 320,
          maxHeight: "calc(100% - 32px)",
          overflowY: "auto",
          padding: 16,
          borderRadius: 12,
          background: "#0b1020",
          border: "1px solid #26335f",
          color: "white",
        }}
      >
        {picked ? (
          <>
            <button
              type="button"
              onClick={() => setPicked(null)}
              style={{ float: "right", width: "auto", marginTop: 0, padding: "4px 10px", fontSize: 12, background: "#26335f" }}
            >
              Whole system
            </button>
            <strong style={{ fontSize: 18 }}>{picked.pl_name}</strong>
            <div style={{ color: "#8d9ac7", marginBottom: 8 }}>{picked.type}</div>
            <Row k="Habitable zone" v={<span style={{ color: colorFor(picked.hz_status) }}>{picked.hz_status}</span>} />
            <Row k="ESI" v={picked.esi ?? "n/a"} />
            <Row k="Radius" v={picked.pl_rade != null ? `${picked.pl_rade} Earth radii` : "n/a"} />
            <Row k="Eq. temp" v={picked.pl_eqt != null ? `${picked.pl_eqt} K` : "n/a"} />
            <Row k="Period" v={picked.pl_orbper != null ? `${picked.pl_orbper} days` : "n/a"} />
            <SizeCompare radius={picked.pl_rade} color={colorFor(picked.hz_status)} />
            <div style={{ fontSize: 11, color: "#6b7aa8", marginTop: 6 }}>
              Surface look is illustrative, not observed.
            </div>
          </>
        ) : (
          <>
            <strong style={{ fontSize: 18 }}>{hostname}</strong>
            <div style={{ color: "#8d9ac7", marginBottom: 8 }}>{starLabel(teff)}</div>
            <Row k="Planets" v={planets.length} />
            <Row k="In habitable zone" v={<span style={{ color: "#4ade80" }}>{hzCount}</span>} />
            <Row k="Star temp" v={teff != null ? `${teff} K` : "n/a"} />
          </>
        )}
        <AskBox api={api} names={askNames} label={askLabel} />
      </div>

      <Canvas camera={{ position: [0, 45, 70], fov: 50 }} onPointerMissed={() => setPicked(null)}>
        <ambientLight intensity={0.5} />
        <Stars radius={100} depth={50} count={3000} factor={4} fade />
        <Star color={color} radius={starRadius} />
        <HabitableBand band={band} />
        {planets.map((p, i) => (
          <Orbiter
            key={p.pl_name}
            planet={p}
            index={i}
            hostname={hostname}
            paused={paused}
            selected={picked?.pl_name === p.pl_name}
            onSelect={setPicked}
          />
        ))}
        <OrbitControls makeDefault minDistance={3} maxDistance={60} />
        <CameraIntro ready={planets.length > 0} />
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.3} luminanceSmoothing={0.25} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}