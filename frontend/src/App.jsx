import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls, Stars } from "@react-three/drei";
import SystemView from "./SystemView";
import "./App.css";

const API = "http://127.0.0.1:8000";
const R = 50;

function toXYZ(raDeg, decDeg) {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return [
    R * Math.cos(dec) * Math.cos(ra),
    R * Math.sin(dec),
    -R * Math.cos(dec) * Math.sin(ra),
  ];
}

function colorFor(hz) {
  if (hz === "In habitable zone") return "#4ade80";
  if (hz === "Too hot") return "#fb923c";
  if (hz === "Too cold") return "#60a5fa";
  return "#cbd5e1";
}

function makeCircleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

function Dots({ list, size, texture, onSelect }) {
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

function Halo({ planet, texture }) {
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

function FlyTo({ target, controlsRef }) {
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

function planetLabel(p) {
  if (p.hostname && p.pl_name.startsWith(p.hostname)) {
    const rest = p.pl_name.slice(p.hostname.length).trim();
    return rest || p.pl_name;
  }
  return p.pl_name;
}

function Panel({ planet, siblings, onPick, onClose, onViewSystem }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReply("");
    setQuestion("");
  }, [planet.pl_name]);

  async function ask(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setReply("");
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, planets: [planet.pl_name] }),
      });
      const data = await res.json();
      setReply(res.ok ? data.reply : `Error: ${data.detail || res.status}`);
    } catch (err) {
      setReply(`Could not reach the backend: ${err.message}`);
    }
    setLoading(false);
  }

  const ly = planet.sy_dist != null ? (planet.sy_dist * 3.2616).toFixed(1) : "unknown";
  const c = planet.pl_eqt != null ? (planet.pl_eqt - 273.15).toFixed(0) : null;

  return (
    <div className="panel">
      <button onClick={onClose} style={{ float: "right", marginTop: 0, background: "#26335f" }}>
        Close
      </button>
      <h2>{planet.pl_name}</h2>
      <div style={{ color: "#8d9ac7" }}>
        {planet.type} · host star {planet.hostname}
      </div>

      {siblings.length > 1 && (
        <div style={{ margin: "12px 0" }}>
          <div style={{ color: "#8d9ac7", fontSize: 13, marginBottom: 6 }}>
            {planet.hostname} has {siblings.length} planets at this spot. Pick one:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {siblings.map((s) => {
              const active = s.pl_name === planet.pl_name;
              const col = colorFor(s.hz_status);
              return (
                <button
                  key={s.pl_name}
                  type="button"
                  title={`${s.pl_name} · ${s.hz_status}`}
                  onClick={() => onPick(s)}
                  style={{
                    width: "auto",
                    marginTop: 0,
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${col}`,
                    background: active ? col : "#141b38",
                    color: active ? "#0b1020" : col,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {planetLabel(s)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <dl>
        <dt>Habitable zone</dt>
        <dd>{planet.hz_status}</dd>
        <dt>ESI</dt>
        <dd>
          {planet.esi ?? "n/a"} (based on {planet.esi_factors} of 4 factors)
        </dd>
        <dt>Distance</dt>
        <dd>{ly} light-years</dd>
        <dt>Radius</dt>
        <dd>{planet.pl_rade ?? "n/a"} Earth radii</dd>
        <dt>Orbital period</dt>
        <dd>{planet.pl_orbper ?? "n/a"} days</dd>
        <dt>Eq. temperature</dt>
        <dd>{planet.pl_eqt != null ? `${planet.pl_eqt} K (${c} °C)` : "n/a"}</dd>
        <dt>Discovered</dt>
        <dd>
          {planet.disc_year} ({planet.discoverymethod})
        </dd>
      </dl>
      <button
        type="button"
        onClick={() => onViewSystem(planet.hostname)}
        style={{ marginBottom: 10 }}
      >
        View system
      </button>
      <form onSubmit={ask}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the astronomer about this planet..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
      {reply && <div className="reply">{reply}</div>}
    </div>
  );
}

export default function App() {
  const [planets, setPlanets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [habitableOnly, setHabitableOnly] = useState(false);
  const [status, setStatus] = useState("Loading...");
  const [systemHost, setSystemHost] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const controlsRef = useRef(null);

  const texture = useMemo(() => makeCircleTexture(), []);
  const habitable = useMemo(
    () => planets.filter((p) => p.hz_status === "In habitable zone"),
    [planets]
  );
  const others = useMemo(
    () => planets.filter((p) => p.hz_status !== "In habitable zone"),
    [planets]
  );

  const siblings = useMemo(() => {
    if (!selected) return [];
    return planets
      .filter((p) => p.hostname === selected.hostname)
      .sort((a, b) => (a.pl_orbper ?? Infinity) - (b.pl_orbper ?? Infinity));
  }, [planets, selected]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: "10000" });
      if (q.trim()) params.set("q", q.trim());
      if (habitableOnly) params.set("habitable", "true");
      try {
        const res = await fetch(`${API}/planets?${params}`, { signal: ctrl.signal });
        const data = await res.json();
        const list = (Array.isArray(data) ? data : []).filter(
          (p) => p.ra != null && p.dec != null
        );
        setPlanets(list);
        if (q.trim() && list.length) setFlyTarget(list[0]);
        setStatus(`${list.length} planets`);
      } catch (err) {
        if (err.name !== "AbortError") setStatus("Backend not reachable");
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, habitableOnly]);

  if (systemHost) {
    return (
      <SystemView api={API} hostname={systemHost} onBack={() => setSystemHost(null)} />
    );
  }

  return (
    <>
      <div className="bar">
        <strong>Exoplanet Explorer</strong>
        <input
          type="text"
          placeholder="Search planet or star"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={habitableOnly}
            onChange={(e) => setHabitableOnly(e.target.checked)}
          />{" "}
          Habitable zone only
        </label>
        <span>{status}</span>
      </div>

      <div className="legend">
        <span style={{ color: "#4ade80" }}>● in habitable zone</span>
        {"  "}
        <span style={{ color: "#fb923c" }}>● too hot</span>
        {"  "}
        <span style={{ color: "#60a5fa" }}>● too cold</span>
        {"  "}
        <span style={{ color: "#cbd5e1" }}>● other</span>
      </div>

      <Canvas
        camera={{ position: [0, 0, 0.1], fov: 60 }}
        raycaster={{ params: { Points: { threshold: 0.5 } } }}
        onPointerMissed={() => setSelected(null)}
      >
        <Stars radius={200} depth={60} count={4000} factor={5} fade />
        {selected && <Halo planet={selected} texture={texture} />}
        <Dots list={others} size={11} texture={texture} onSelect={setSelected} />
        <Dots list={habitable} size={16} texture={texture} onSelect={setSelected} />
        <FlyTo target={flyTarget} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enableZoom={false}
          enablePan={false}
          rotateSpeed={-0.35}
        />
      </Canvas>

      {selected && (
        <Panel
          planet={selected}
          siblings={siblings}
          onPick={setSelected}
          onClose={() => setSelected(null)}
          onViewSystem={setSystemHost}
        />
      )}
    </>
  );
}