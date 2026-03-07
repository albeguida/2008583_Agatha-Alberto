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
    <section style={{ marginTop: 24 }}>
      <h2>Actuators</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {ACTUATORS.map((name) => {
          const state = states[name] ?? "—";
          const isOn = state === "ON";
          return (
            <div
              key={name}
              style={{
                border: `2px solid ${isOn ? "#22c55e" : "#d1d5db"}`,
                borderRadius: 8,
                padding: 12,
                minWidth: 180,
                background: isOn ? "#f0fdf4" : "#f9fafb",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: 8 }}>{LABELS[name]}</div>
              <div style={{ marginBottom: 8, color: isOn ? "#16a34a" : "#6b7280" }}>
                State: <strong>{state}</strong>
              </div>
              <button
                onClick={() => toggle(name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px",
                  background: isOn ? "#ef4444" : "#22c55e",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
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
