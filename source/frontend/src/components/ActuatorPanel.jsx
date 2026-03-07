/**
 * ActuatorPanel — shows current actuator states and allows manual toggle (US07).
 */
import { useEffect, useState } from "react";
import { Power } from "lucide-react";

const ACTUATORS = ["cooling_fan", "entrance_humidifier", "hall_ventilation", "habitat_heater"];

const LABELS = {
  cooling_fan: "Cooling Fan",
  entrance_humidifier: "Entrance Humidifier",
  hall_ventilation: "Hall Ventilation",
  habitat_heater: "Habitat Heater",
};

export default function ActuatorPanel({ apiBase }) {
  const [states, setStates] = useState({});

  const fetchStates = async () => {
    try {
      const res = await fetch(`${apiBase}/actuators`);
      const data = await res.json();
      setStates(data.actuators ?? {});
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStates();
    const interval = setInterval(fetchStates, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggle = async (name) => {
    const current = states[name] ?? "OFF";
    const next = current === "ON" ? "OFF" : "ON";
    try {
      await fetch(`${apiBase}/actuators/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      setStates((prev) => ({ ...prev, [name]: next }));
    } catch {
      // ignore
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Actuators</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {ACTUATORS.map((name) => {
          const state = states[name] ?? "—";
          const isOn = state === "ON";
          return (
            <div
              key={name}
              style={{
                border: `1px solid ${isOn ? "#166534" : "#2a2a2a"}`,
                borderRadius: 10,
                padding: 16,
                minWidth: 200,
                background: isOn ? "rgba(22, 101, 52, 0.15)" : "#1a1a1a",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 10, color: "#e5e5e5", fontSize: 14 }}>{LABELS[name]}</div>
              <div style={{ marginBottom: 12, color: isOn ? "#4ade80" : "#737373", fontSize: 13 }}>
                State: <strong style={{ color: isOn ? "#22c55e" : "#a3a3a3" }}>{state}</strong>
              </div>
              <button
                onClick={() => toggle(name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  background: isOn ? "#b91c1c" : "#15803d",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  transition: "background 0.15s",
                }}
              >
                <Power size={14} /> Turn {isOn ? "OFF" : "ON"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
