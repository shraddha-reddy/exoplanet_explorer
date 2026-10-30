import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import SystemView from "./SystemView";
import Dots from "./Dots";
import Halo from "./Halo";
import FlyTo from "./FlyTo";
import Panel from "./Panel";
import { API, makeCircleTexture } from "./utils";
import "./App.css";

export default function App() {
  const [planets, setPlanets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [habitableOnly, setHabitableOnly] = useState(false);
  const [status, setStatus] = useState("Loading...");
  const [systemPlanet, setSystemPlanet] = useState(null);
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
          onViewSystem={setSystemPlanet}
        />
      )}
    </>
  );
}