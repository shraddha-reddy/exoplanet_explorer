import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import SystemView from "./SystemView";
import GalaxyView from "./GalaxyView";
import Dots from "./Dots";
import Halo from "./Halo";
import FlyTo from "./FlyTo";
import Panel from "./Panel";
import Nebula from "./Nebula";
import Zoom from "./Zoom";
import { API, makeCircleTexture } from "./utils";
import "./App.css";

const zoomBtn = {
  width: 40,
  height: 40,
  marginTop: 0,
  padding: 0,
  fontSize: 20,
  borderRadius: 10,
  border: "1px solid #26335f",
  background: "#0b1020ee",
  color: "#e2e8f0",
  cursor: "pointer",
};

export default function App() {
  const [planets, setPlanets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [habitableOnly, setHabitableOnly] = useState(false);
  const [status, setStatus] = useState("Loading...");
  const [systemPlanet, setSystemPlanet] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [mode, setMode] = useState("sky"); // "sky" | "galaxy"
  const controlsRef = useRef(null);
  const tipRef = useRef(null);
  const zoomApi = useRef(null);

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

  // tooltip is updated directly on the DOM so mouse movement never re-renders the app
  function handleHover(p, ev) {
    const el = tipRef.current;
    if (!el) return;
    if (!p || !ev) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = ev.clientX + 14 + "px";
    el.style.top = ev.clientY + 14 + "px";
    el.textContent = `${p.pl_name} · ${p.type} · ${p.hz_status}`;
  }

  function goToKepler() {
    setFlyTarget({ ra: 290.7, dec: 44.5, pl_name: "kepler-field" });
    zoomApi.current?.set(14);
  }

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
        if (q.trim() && list.length) {
          setFlyTarget(list[0]);
          zoomApi.current?.set(25);
        }
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

  if (systemPlanet) {
    return (
      <SystemView
        api={API}
        hostname={systemPlanet.hostname}
        initialPlanet={systemPlanet}
        onBack={() => setSystemPlanet(null)}
      />
    );
  }

  const galaxy = mode === "galaxy";

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

      {/* sky / galaxy toggle */}
      <div
        style={{
          position: "fixed",
          zIndex: 20,
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={() => setMode(galaxy ? "sky" : "galaxy")}
          style={{
            ...zoomBtn,
            width: "auto",
            padding: "0 18px",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 999,
          }}
        >
          {galaxy ? "← Back to sky view" : "Zoom out to galaxy map"}
        </button>
        {galaxy && (
          <div style={{ color: "#8d9ac7", fontSize: 12 }}>
            Distance scale is logarithmic (compressed) · Sun at centre
          </div>
        )}
      </div>

      {!galaxy && (
        <div
          style={{
            position: "fixed",
            zIndex: 20,
            bottom: 16,
            right: selected ? 400 : 16,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            alignItems: "flex-end",
          }}
        >
          <button type="button" style={zoomBtn} title="Zoom in" onClick={() => zoomApi.current?.zoomBy(0.6)}>
            +
          </button>
          <button type="button" style={zoomBtn} title="Zoom out" onClick={() => zoomApi.current?.zoomBy(1.6)}>
            −
          </button>
          <button
            type="button"
            style={{ ...zoomBtn, width: "auto", padding: "0 12px", fontSize: 12 }}
            title="Reset view"
            onClick={() => zoomApi.current?.set(60)}
          >
            Reset
          </button>
          <button
            type="button"
            style={{ ...zoomBtn, width: "auto", padding: "0 12px", fontSize: 12 }}
            title="Jump to the Kepler field"
            onClick={goToKepler}
          >
            Kepler field
          </button>
        </div>
      )}

      <div
        ref={tipRef}
        style={{
          display: "none",
          position: "fixed",
          zIndex: 30,
          pointerEvents: "none",
          padding: "6px 10px",
          borderRadius: 8,
          background: "#0b1020ee",
          border: "1px solid #26335f",
          color: "#e2e8f0",
          fontSize: 13,
        }}
      />

      {galaxy ? (
        <GalaxyView
          planets={planets}
          selected={selected}
          onSelect={setSelected}
          onHover={handleHover}
        />
      ) : (
        <Canvas
          camera={{ position: [0, 0, 0.1], fov: 60, far: 1000 }}
          raycaster={{ params: { Points: { threshold: 0.5 } } }}
          onPointerMissed={() => setSelected(null)}
        >
          <Nebula />
          <Stars radius={200} depth={60} count={4000} factor={5} fade />
          {selected && <Halo planet={selected} texture={texture} />}
          <Dots list={others} size={11} texture={texture} onSelect={setSelected} onHover={handleHover} />
          <Dots list={habitable} size={16} texture={texture} onSelect={setSelected} onHover={handleHover} />
          <FlyTo target={flyTarget} controlsRef={controlsRef} />
          <Zoom api={zoomApi} controlsRef={controlsRef} />
          <OrbitControls
            ref={controlsRef}
            enableZoom={false}
            enablePan={false}
            rotateSpeed={-0.35}
            autoRotate={!selected}
            autoRotateSpeed={0.3}
          />
        </Canvas>
      )}

      {selected && (
        <Panel
          planet={selected}
          siblings={siblings}
          onPick={setSelected}
          onClose={() => setSelected(null)}
          onViewSystem={setSystemPlanet}
        />
      )}
    </>
  );
}