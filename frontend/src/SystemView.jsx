import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Stars } from "@react-three/drei";
import { AdditiveBlending, BackSide, DoubleSide } from "three";

const SUGGESTIONS = [
  "Could life exist here?",
  "How does it compare to Earth?",
  "What makes this system special?",
];

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

function shortName(p, hostname) {
  if (p.pl_name.startsWith(hostname)) {
    const rest = p.pl_name.slice(hostname.length).trim();
    return rest || p.pl_name;
  }
  return p.pl_name;
}

function Star({ color, radius }) {
  const glow = useRef();

  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.getElapsedTime() * 1.5) * 0.03;
    if (glow.current) glow.current.scale.setScalar(s);
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <group ref={glow}>
        <mesh>
          <sphereGeometry args={[radius * 1.25, 48, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.22}
            blending={AdditiveBlending}
            depthWrite={false}
            side={BackSide}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[radius * 1.7, 48, 48]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.09}
            blending={AdditiveBlending}
            depthWrite={false}
            side={BackSide}
          />
        </mesh>
      </group>
      <pointLight color={color} intensity={120} />
    </group>
  );
}

function Orbiter({ planet, index, hostname, paused, selected, onSelect }) {
  const ref = useRef();
  const angle = useRef(index * 1.7);
  const [hovered, setHovered] = useState(false);

  const orbit = 2.5 + index * 1.6; // evenly spaced for readability, not to scale
  const period = Math.max(planet.pl_orbper ?? 100, 0.5);
  const speed = 1.2 / Math.pow(period, 0.4);
  const size = Math.min(0.6, Math.max(0.12, Math.cbrt(planet.pl_rade ?? 1) * 0.14));
  const col = colorFor(planet.hz_status);
  const inHz = planet.hz_status === "In habitable zone";
  const active = selected || hovered;

  useFrame((_, delta) => {
    if (!paused) angle.current += delta * speed;
    if (!ref.current) return;
    ref.current.position.set(
      Math.cos(angle.current) * orbit,
      0,
      Math.sin(angle.current) * orbit
    );
    ref.current.scale.setScalar(active ? 1.3 : 1);
  });

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[orbit - (inHz ? 0.03 : 0.015), orbit + (inHz ? 0.03 : 0.015), 128]} />
        <meshBasicMaterial
          color={inHz ? "#4ade80" : "#3b4a7a"}
          transparent
          opacity={inHz ? (selected ? 1 : 0.7) : selected ? 1 : 0.8}
          side={DoubleSide}
        />
      </mesh>
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
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={active ? 0.5 : 0.15}
          roughness={0.8}
        />
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
    </>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "#8d9ac7" }}>{k}</span>
      <span style={{ textAlign: "right" }}>{v}</span>
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
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Type your own question..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
      {reply && (
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
          {reply}
        </div>
      )}
    </div>
  );
}

export default function SystemView({ api, hostname, onBack }) {
  const [planets, setPlanets] = useState([]);
  const [picked, setPicked] = useState(null);
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
  const color = starColor(first?.st_teff);
  const starRadius = Math.min(1.4, Math.max(0.6, Math.cbrt(first?.st_rad ?? 1)));

  const askNames = picked ? [picked.pl_name] : planets.map((p) => p.pl_name);
  const askLabel = picked ? picked.pl_name : `the ${hostname} system`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <div style={{ position: "absolute", zIndex: 10, top: 16, left: 16, color: "white" }}>
        <button onClick={onBack}>← Back to sky</button>
        <div style={{ marginTop: 8, fontWeight: 600 }}>{hostname}</div>
        <div style={{ color: "#8d9ac7", fontSize: 13 }}>
          {status || `${planets.length} planet${planets.length === 1 ? "" : "s"} · not to scale`}
        </div>
        <button
          onClick={() => setPaused((v) => !v)}
          style={{ width: "auto", marginTop: 10, padding: "6px 12px", background: "#26335f" }}
        >
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
            <strong style={{ fontSize: 18 }}>{picked.pl_name}</strong>
            <div style={{ color: "#8d9ac7", marginBottom: 8 }}>{picked.type}</div>
            <Row
              k="Habitable zone"
              v={<span style={{ color: colorFor(picked.hz_status) }}>{picked.hz_status}</span>}
            />
            <Row k="ESI" v={picked.esi ?? "n/a"} />
            <Row k="Radius" v={picked.pl_rade != null ? `${picked.pl_rade} Earth radii` : "n/a"} />
            <Row k="Eq. temp" v={picked.pl_eqt != null ? `${picked.pl_eqt} K` : "n/a"} />
            <Row k="Period" v={picked.pl_orbper != null ? `${picked.pl_orbper} days` : "n/a"} />
          </>
        ) : (
          <div style={{ color: "#8d9ac7" }}>
            Click a planet to inspect it, or ask about the whole system below.
          </div>
        )}
        <AskBox api={api} names={askNames} label={askLabel} />
      </div>

      <Canvas camera={{ position: [0, 9, 15], fov: 50 }} onPointerMissed={() => setPicked(null)}>
        <ambientLight intensity={0.5} />
        <Stars radius={100} depth={50} count={3000} factor={4} fade />
        <Star color={color} radius={starRadius} />
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
        <OrbitControls minDistance={3} maxDistance={60} />
      </Canvas>
    </div>
  );
}