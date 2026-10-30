import { useEffect, useState } from "react";
import { API, colorFor, planetLabel } from "./utils";

const SUGGESTIONS = [
  "Could life exist here?",
  "How does it compare to Earth?",
  "What makes this planet special?",
];

export default function Panel({ planet, siblings, onPick, onClose, onViewSystem }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReply("");
    setQuestion("");
  }, [planet.pl_name]);

  async function send(text) {
    const message = text.trim();
    if (!message) return;
    setLoading(true);
    setReply("");
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, planets: [planet.pl_name] }),
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
        onClick={() => onViewSystem(planet)}
        style={{ marginBottom: 10 }}
      >
        View system
      </button>

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