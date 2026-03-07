# Mars Operations – Project Input Document

## 1. System Overview

The **Mars Operations Platform** is a distributed, event-driven automation system for managing a Mars habitat.
It continuously polls physical sensors in the habitat, normalises heterogeneous payloads into a unified schema,
evaluates user-defined IF-THEN automation rules, and drives actuators accordingly — all with a live web dashboard.

### Architecture at a Glance

```
[ Mars IoT Simulator ]
        │  REST polling every 5 s
        ▼
[ Ingestion Service ]  ──publish──▶  [ Redis Pub/Sub ]
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                      [ Rules Engine ]  [ API Gateway ]   (future)
                         (SQLite DB)        (BFF)
                              │               │
                              │ actuator POST  │ WebSocket / REST
                              ▼               ▼
                     [ Simulator actuators ]  [ React Frontend ]
```

Key design principles:
- **No tight coupling**: services communicate exclusively through Redis Pub/Sub.
- **No authentication**: single-tenant, no user accounts.
- **No historical persistence**: only the latest sensor reading (Redis cache) and automation rules (SQLite) are stored.
- **Immutable simulator**: the `mars-iot-simulator:multiarch_v1` container is never modified; interaction is REST-only.

---

## 2. User Stories

| ID | Title | Description | Acceptance Criteria |
|:---|:------|:------------|:--------------------|
| US01 | Live Sensor Monitoring | As an engineer, I want to see `greenhouse_temperature` updated every 5 s on the dashboard. | Dashboard shows current temperature value refreshed automatically. |
| US02 | Resource Level Tracking | As a specialist, I want to monitor `water_tank_level` to prevent dehydration. | Dashboard displays water level percentage and litres in real time. |
| US03 | Unified Data Normalisation | As a developer, I want all sensors (scalar, chemistry, level, particulate) converted to a standard internal JSON format. | All events on the broker follow `normalized.v1` schema regardless of source schema. |
| US04 | Automated Rule Creation | As a technician, I want to define "IF sensor > value THEN actuator ON/OFF" rules via the UI. | Form in the dashboard POSTs a new rule; it appears in the active rules list. |
| US05 | Rule Persistence | As an admin, I want rules saved in a database so they survive service restarts. | After `docker compose restart rules-engine`, previously created rules are still applied. |
| US06 | Autonomous Actuation | As a safety officer, I want the system to trigger `cooling_fan` automatically when temperature is high based on my rules. | When a rule `IF greenhouse_temperature > 30 THEN set cooling_fan to ON` exists, the fan turns on as soon as the reading exceeds 30. |
| US07 | Manual Override | As a user, I want to manually toggle `habitat_heater` state from the dashboard. | Clicking the toggle button sends a POST to the simulator actuator and updates the UI immediately. |
| US08 | Rule Management UI | As a technician, I want to view and delete active rules in the frontend. | Active rules list shows rule text; each row has a Delete button that removes the rule. |
| US09 | Real-Time UI Updates | As an operator, I want the dashboard to update values without manual page refreshes. | Dashboard uses WebSocket (or SSE) from the API Gateway; no manual refresh needed. |
| US10 | Simulator Connectivity | As an operator, I want a visual indicator when the polling connection to the Mars sensors is lost or failing. | A status badge turns red when the ingestion service fails to reach the simulator for >10 s. |

---

## 3. Unified Standard Event Schema (`normalized.v1`)

All sensor readings published to the Redis channel `mars.sensors` follow this schema:

```json
{
  "schema_version": "normalized.v1",
  "sensor_id":      "string  – unique sensor identifier (e.g. greenhouse_temperature)",
  "metric":         "string  – primary metric name (e.g. temperature, ph, level_pct, pm25)",
  "value":          "number  – primary numeric reading",
  "unit":           "string  – physical unit (e.g. °C, %, ppm, ug/m3)",
  "status":         "string  – ok | warning",
  "captured_at":    "string  – ISO-8601 datetime from the simulator",
  "ingested_at":    "string  – ISO-8601 datetime when the ingestion service processed the reading"
}
```

### Normalisation Mapping per Source Schema

| Source Schema | Sensors | `metric` | `value` | `unit` |
|:---|:---|:---|:---|:---|
| `rest.scalar.v1` | `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, `corridor_pressure` | `payload.metric` | `payload.value` | `payload.unit` |
| `rest.chemistry.v1` | `hydroponic_ph`, `air_quality_voc` | `payload.measurements[0].metric` | `payload.measurements[0].value` | `payload.measurements[0].unit` |
| `rest.level.v1` | `water_tank_level` | `"level_pct"` | `payload.level_pct` | `"%"` |
| `rest.particulate.v1` | `air_quality_pm25` | `"pm25"` | `payload.pm25_ug_m3` | `"ug/m3"` |

---

## 4. Rule Model

Rules are persisted in the SQLite database (table `rules`) with the following structure:

| Column | Type | Description |
|:-------|:-----|:------------|
| `id` | INTEGER PK | Auto-increment identifier |
| `sensor_id` | TEXT NOT NULL | Sensor to watch (e.g. `greenhouse_temperature`) |
| `operator` | TEXT NOT NULL | Comparison operator: `<`, `<=`, `=`, `>`, `>=` |
| `threshold` | REAL NOT NULL | Numeric threshold value |
| `actuator_id` | TEXT NOT NULL | Target actuator (e.g. `cooling_fan`) |
| `action` | TEXT NOT NULL | `ON` or `OFF` |
| `created_at` | TEXT NOT NULL | ISO-8601 creation timestamp |

### Rule Syntax (human-readable representation)

```
IF <sensor_id> <operator> <threshold> THEN set <actuator_id> to <ON|OFF>
```

**Example:**
```
IF greenhouse_temperature > 30 THEN set cooling_fan to ON
IF co2_hall >= 1000 THEN set hall_ventilation to ON
IF entrance_humidity < 30 THEN set entrance_humidifier to ON
```

### Evaluation Logic

On every normalised event arriving via Redis Pub/Sub:
1. Load all active rules from the in-memory cache (refreshed from DB on startup and on write).
2. Filter rules whose `sensor_id` matches the event's `sensor_id`.
3. Evaluate `event.value <operator> rule.threshold`.
4. For each matching rule, POST `{"state": "<action>"}` to `http://simulator:8080/api/actuators/<actuator_id>`.
