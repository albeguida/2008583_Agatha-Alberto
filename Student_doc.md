# SYSTEM DESCRIPTION:

The **Mars Operations Platform** is a distributed, event-driven automation system designed to monitor and control
a Mars habitat. It polls 8 REST sensors from an IoT simulator every 5 seconds, normalises the heterogeneous
payloads into a unified schema (`normalized.v1`), publishes events to a Redis Pub/Sub message broker, evaluates
user-defined IF-THEN automation rules, and drives 4 physical actuators. A React-based web dashboard provides
real-time visibility and rule management.

# USER STORIES:

- US01: Live Sensor Monitoring — dashboard shows `greenhouse_temperature` refreshed every 5 s.
- US02: Resource Level Tracking — dashboard shows `water_tank_level` in % and litres.
- US03: Unified Data Normalisation — all REST sensor payloads normalised to `normalized.v1`.
- US04: Automated Rule Creation — user defines IF-THEN rules via the UI form.
- US05: Rule Persistence — rules survive service restarts (SQLite-backed).
- US06: Autonomous Actuation — `cooling_fan` toggled automatically by matching rules.
- US07: Manual Override — user can manually toggle any actuator from the dashboard.
- US08: Rule Management UI — active rules list with per-rule delete button.
- US09: Real-Time UI Updates — dashboard updated via WebSocket from API Gateway (no manual refresh).
- US10: Simulator Connectivity — visual badge turns red when ingestion polling fails for >10 s.


# CONTAINERS:

---

## CONTAINER_NAME: simulator

### DESCRIPTION:
Third-party Mars IoT Simulator (`mars-iot-simulator:latest`). Exposes a REST API at port 8080.
This container is **immutable** — it is never modified by our platform.

### USER STORIES:
US01, US02, US03, US06, US07, US10

### PORTS:
- `8080` — published to host for manual testing; consumed internally by `ingestion` and `rules-engine`.

### PERSISTENCE EVALUATION
No persistence. The simulator manages its own internal state.

### EXTERNAL SERVICES CONNECTIONS
None (it is the data source).

### MICROSERVICES:
(Third-party — no microservices of ours run inside this container.)

---

## CONTAINER_NAME: redis

### DESCRIPTION:
Redis 7 (Alpine) acts as the message broker and latest-state cache. Redis Pub/Sub channel `mars.sensors`
carries `normalized.v1` events between the Ingestion Service and the Rules Engine / API Gateway.
Redis Keys (prefix `sensor:<sensor_id>`) cache the last known reading of each sensor.

### USER STORIES:
US01, US02, US03, US09, US10

### PORTS:
- `6379` — internal only (not published to host).

### DESCRIPTION:
Acts as both an asynchronous event bus (Pub/Sub) and an in-memory latest-state cache (Redis Keys).

### PERSISTENCE EVALUATION
No persistence configured. Data is in-memory only. The latest sensor state is rebuilt within 5 s after
a restart (next poll cycle).

### EXTERNAL SERVICES CONNECTIONS
Consumed by: `ingestion`, `rules-engine`, `api-gateway`.

### MICROSERVICES:
(Official Redis image — no custom code.)

---

## CONTAINER_NAME: ingestion

### DESCRIPTION:
Responsible for polling the simulator REST API every 5 seconds, normalising the raw payloads, and
publishing `normalized.v1` events to the Redis Pub/Sub channel `mars.sensors`. Also tracks connectivity
health and publishes status to the `mars.health` Redis key.

### USER STORIES:
US01, US02, US03, US10

### PORTS:
No ports published to host.

### PERSISTENCE EVALUATION
Stateless. No database. All data forwarded to Redis.

### EXTERNAL SERVICES CONNECTIONS
- Reads from: `http://simulator:8080/api/sensors` (polling via `httpx` async client).
- Publishes to: Redis channel `mars.sensors` and Redis key `mars.health`.

### MICROSERVICES:

#### MICROSERVICE: ingestion-service
- TYPE: backend
- DESCRIPTION: Async Python service that polls all 8 REST sensors, normalises responses to `normalized.v1`,
  and publishes to Redis. Updates `mars.health` Redis key with `{"status":"ok"|"error","last_poll":"<ISO8601>"}`.
- PORTS: none
- TECHNOLOGICAL SPECIFICATION:
  Python 3.12, FastAPI (for health endpoint only), `httpx` (async HTTP client), `redis-py` (async),
  running as an `asyncio` background task loop.
- SERVICE ARCHITECTURE:
  Single async loop: `poll_all_sensors()` → `normalise(payload, schema)` → `redis.publish("mars.sensors", json)`.
  Handles all 4 schema types: `rest.scalar.v1`, `rest.chemistry.v1`, `rest.level.v1`, `rest.particulate.v1`.

- ENDPOINTS:

  | HTTP METHOD | URL | Description | User Stories |
  | ----------- | --- | ----------- | ------------ |
  | GET | /health | Returns `{"status":"ok"}` for Docker health-check | US10 |

---

## CONTAINER_NAME: rules-engine

### DESCRIPTION:
Subscribes to the Redis `mars.sensors` channel, maintains the latest sensor state in memory,
evaluates all active IF-THEN rules on each event, and fires actuator POST requests to the simulator.
Exposes a REST API for rule CRUD (consumed by the API Gateway).

### USER STORIES:
US04, US05, US06, US08

### PORTS:
- `8001` — internal only (API Gateway proxies requests to this service).

### PERSISTENCE EVALUATION
Rules are persisted in SQLite (`/data/rules.db`) mounted via a named Docker volume `rules_db`.
The in-memory rule cache is loaded from DB at startup and updated on every write.

### EXTERNAL SERVICES CONNECTIONS
- Subscribes to: Redis channel `mars.sensors`.
- POSTs actuator commands to: `http://simulator:8080/api/actuators/<name>`.

### MICROSERVICES:

#### MICROSERVICE: rules-engine-service
- TYPE: backend
- DESCRIPTION: FastAPI service. Background async task subscribes to Redis and evaluates rules.
  CRUD endpoints manage rules in SQLite via SQLAlchemy.
- PORTS: 8001 (internal)
- TECHNOLOGICAL SPECIFICATION:
  Python 3.12, FastAPI, SQLAlchemy (sync, SQLite), `redis-py` (async Pub/Sub), `httpx` (actuator calls).
- SERVICE ARCHITECTURE:
  On startup: load rules from DB into memory. Start async Redis subscriber task.
  On each Redis message: evaluate all rules for matching `sensor_id`. Fire actuators as needed.

- ENDPOINTS:

  | HTTP METHOD | URL | Description | User Stories |
  | ----------- | --- | ----------- | ------------ |
  | GET | /rules | List all active rules | US08 |
  | POST | /rules | Create a new rule | US04, US05 |
  | DELETE | /rules/{id} | Delete a rule by ID | US08 |
  | GET | /health | Service health check | — |

- DB STRUCTURE:

  **_rules_** : | **_id_** | sensor_id | operator | threshold | actuator_id | action | created_at |

---

## CONTAINER_NAME: api-gateway

### DESCRIPTION:
Backend-for-Frontend (BFF). Exposes a unified REST + WebSocket API consumed by the React frontend.
Reads latest sensor state from Redis Keys. Proxies rule CRUD to `rules-engine`. Provides a WebSocket
endpoint that pushes `normalized.v1` events to connected browser clients in real time. Also exposes
a manual actuator override endpoint.

### USER STORIES:
US01, US02, US07, US08, US09, US10

### PORTS:
- `8000` — published to host; consumed by the React frontend.

### PERSISTENCE EVALUATION
Stateless. Reads from Redis; proxies to rules-engine.

### EXTERNAL SERVICES CONNECTIONS
- Reads latest state from: Redis Keys `sensor:<id>` and `mars.health`.
- Subscribes to: Redis channel `mars.sensors` (for WebSocket fan-out).
- Proxies rule CRUD to: `http://rules-engine:8001`.
- POSTs manual actuator commands to: `http://simulator:8080/api/actuators/<name>`.

### MICROSERVICES:

#### MICROSERVICE: api-gateway-service
- TYPE: backend
- DESCRIPTION: FastAPI service. Bridges the Redis event bus to WebSocket clients and provides REST
  endpoints for the frontend (sensor snapshots, rules CRUD, manual actuator control, health status).
- PORTS: 8000
- TECHNOLOGICAL SPECIFICATION:
  Python 3.12, FastAPI, `redis-py` (async), `httpx`, WebSockets (FastAPI native).
- SERVICE ARCHITECTURE:
  On WebSocket connect: subscribe client to Redis `mars.sensors` channel; stream events.
  REST endpoints: proxy to rules-engine or interact directly with Redis/simulator.

- ENDPOINTS:

  | HTTP METHOD | URL | Description | User Stories |
  | ----------- | --- | ----------- | ------------ |
  | GET | /sensors | Return latest state of all sensors (from Redis cache) | US01, US02 |
  | GET | /sensors/{id} | Return latest state of a single sensor | US01, US02 |
  | WS | /ws/sensors | WebSocket stream of normalised sensor events | US09 |
  | GET | /actuators | List all actuators and their current state | US07 |
  | POST | /actuators/{name} | Manually set actuator state `{"state":"ON"|"OFF"}` | US07 |
  | GET | /rules | List all rules (proxied to rules-engine) | US08 |
  | POST | /rules | Create a rule (proxied to rules-engine) | US04, US05 |
  | DELETE | /rules/{id} | Delete a rule (proxied to rules-engine) | US08 |
  | GET | /health | Ingestion connectivity status from Redis `mars.health` key | US10 |

---

## CONTAINER_NAME: frontend

### DESCRIPTION:
Single-page React application (built with Vite) served by an Nginx container. Provides the real-time
dashboard (live sensor tiles, actuator controls, rule management form, connectivity badge).

### USER STORIES:
US01, US02, US04, US06, US07, US08, US09, US10

### PORTS:
- `3000` (→ Nginx port 80 internally) — published to host.

### PERSISTENCE EVALUATION
No persistence (stateless SPA).

### EXTERNAL SERVICES CONNECTIONS
- REST calls and WebSocket to: `http://localhost:8000` (API Gateway).

### MICROSERVICES:

#### MICROSERVICE: frontend-spa
- TYPE: frontend
- DESCRIPTION: React + Vite SPA. Uses Lucide-react for icons, Recharts for line charts, and a
  native WebSocket connection to the API Gateway for real-time updates.
- PORTS: 80 (internal Nginx), 3000 (host)
- TECHNOLOGICAL SPECIFICATION:
  React 18, Vite 5, Lucide-react, Recharts, plain `fetch` for REST, native `WebSocket` for streaming.
- SERVICE ARCHITECTURE:
  On load: open WS to `/ws/sensors`. On each message: update sensor state in React state.
  Polling fallback every 5 s if WebSocket unavailable.

- PAGES:

  | Name | Description | Related Microservice | User Stories |
  | ---- | ----------- | -------------------- | ------------ |
  | Dashboard | Live sensor tiles grid, actuator toggle buttons, connectivity badge | api-gateway | US01, US02, US07, US09, US10 |
  | Rules | Active rules list with delete, new-rule form | api-gateway → rules-engine | US04, US05, US06, US08 |
