/**
 * Mars Operations Dashboard – Root App
 *
 * Pages:
 *   / (Dashboard) — live sensor tiles, actuator toggles, connectivity badge
 *   /rules        — active rules list + new-rule form
 *
 * Real-time updates via WebSocket to API Gateway /ws/sensors (US09).
 */
import { useEffect, useState } from "react";
import { Activity, Wifi, WifiOff } from "lucide-react";
import SensorGrid from "./components/SensorGrid";
import ActuatorPanel from "./components/ActuatorPanel";
import RulesPage from "./components/RulesPage";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/sensors";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sensors, setSensors] = useState({});
  const [connected, setConnected] = useState(false);
  const [simStatus, setSimStatus] = useState("unknown");

  // ── WebSocket (US09) ────────────────────────────────────────────────────────
  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        setSensors((prev) => ({ ...prev, [event.sensor_id]: event }));
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // ── Polling fallback for initial load + connectivity badge (US10) ───────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sensorsRes, healthRes] = await Promise.all([
          fetch(`${API_BASE}/sensors`),
          fetch(`${API_BASE}/health`),
        ]);
        const sensorsData = await sensorsRes.json();
        setSensors((prev) => ({ ...prev, ...sensorsData }));
        const health = await healthRes.json();
        setSimStatus(health.status ?? "unknown");
      } catch {
        setSimStatus("error");
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Mars Operations Dashboard</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* WebSocket badge */}
          {connected
            ? <span style={{ color: "green", display: "flex", gap: 4 }}><Wifi size={16} /> Connected</span>
            : <span style={{ color: "red", display: "flex", gap: 4 }}><WifiOff size={16} /> Reconnecting…</span>}
          {/* Simulator health badge (US10) */}
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <Activity size={16} />
            Simulator:{" "}
            <strong style={{ color: simStatus === "ok" ? "green" : simStatus === "error" ? "red" : "orange" }}>
              {simStatus.toUpperCase()}
            </strong>
          </span>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ marginBottom: 16 }}>
        <button onClick={() => setPage("dashboard")} style={{ marginRight: 8, fontWeight: page === "dashboard" ? "bold" : "normal" }}>
          Dashboard
        </button>
        <button onClick={() => setPage("rules")} style={{ fontWeight: page === "rules" ? "bold" : "normal" }}>
          Rules
        </button>
      </nav>

      {/* Pages */}
      {page === "dashboard" && (
        <>
          <SensorGrid sensors={sensors} />
          <ActuatorPanel apiBase={API_BASE} />
        </>
      )}
      {page === "rules" && <RulesPage apiBase={API_BASE} />}
    </div>
  );
}
