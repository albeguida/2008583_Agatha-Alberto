/**
 * SensorGrid — displays the latest reading for all 8 sensors (US01, US02, US03).
 */
const SENSOR_LABELS = {
  greenhouse_temperature: "Greenhouse Temp",
  entrance_humidity: "Entrance Humidity",
  co2_hall: "CO₂ Hall",
  hydroponic_ph: "Hydroponic pH",
  water_tank_level: "Water Tank Level",
  corridor_pressure: "Corridor Pressure",
  air_quality_pm25: "Air Quality PM2.5",
  air_quality_voc: "Air Quality VOC",
};

export default function SensorGrid({ sensors }) {
  return (
    <section>
      <h2>Sensors</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {Object.keys(SENSOR_LABELS).map((id) => {
          const s = sensors[id];
          return (
            <div
              key={id}
              style={{
                border: `2px solid ${s?.status === "warning" ? "#f59e0b" : "#3b82f6"}`,
                borderRadius: 8,
                padding: 12,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: 13, marginBottom: 4 }}>{SENSOR_LABELS[id]}</div>
              {s ? (
                <>
                  <div style={{ fontSize: 24, fontWeight: "bold" }}>
                    {s.value ?? "—"} <span style={{ fontSize: 14 }}>{s.unit}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    {s.status?.toUpperCase()} · {new Date(s.captured_at).toLocaleTimeString()}
                  </div>
                </>
              ) : (
                <div style={{ color: "#9ca3af" }}>Waiting…</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
