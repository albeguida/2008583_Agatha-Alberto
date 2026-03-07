# Architecture Diagram

## System Overview (C4 Container Level)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Docker Compose Network: mars_net                        │
│                                                                                  │
│  ┌─────────────────┐   REST polling    ┌────────────────────┐                   │
│  │                 │◄──every 5 s──────│                    │                   │
│  │  Mars IoT       │                   │  Ingestion Service │                   │
│  │  Simulator      │                   │  (Python/FastAPI)  │                   │
│  │  :8080          │──── payload ─────►│                    │                   │
│  │  (immutable)    │                   └────────┬───────────┘                   │
│  │                 │                            │ publish normalized.v1          │
│  │                 │◄── POST /actuators ────────│ to mars.sensors channel        │
│  └─────────────────┘         ▲                 ▼                                │
│                               │          ┌────────────────────┐                 │
│                               │          │                    │                 │
│                               │          │  Redis Broker      │                 │
│                               │          │  Pub/Sub + Cache   │                 │
│                               │          │  :6379             │                 │
│                               │          └────────┬───────────┘                 │
│                               │                   │ subscribe                   │
│                               │          ┌────────┴──────────────────────┐      │
│                               │          │                               │      │
│                     ┌─────────┴────────┐ │                    ┌─────────┴────┐  │
│                     │ Rules Engine     │◄┘                    │ API Gateway  │  │
│                     │ (Python/FastAPI) │                      │ (BFF)        │  │
│                     │ SQLite DB        │◄──── rule CRUD ──────│ :8000        │  │
│                     │ :8001 (internal) │                      └──────┬───────┘  │
│                     └──────────────────┘                             │          │
│                                                                      │ WS/REST  │
└──────────────────────────────────────────────────────────────────────┼──────────┘
                                                                       │
                                                              ┌────────▼───────┐
                                                              │  React Frontend │
                                                              │  (Vite + Nginx) │
                                                              │  :3000          │
                                                              └────────────────┘
                                                                  (Browser)
```

## Data Flow

1. **Ingestion**: `Ingestion Service` polls `GET /api/sensors` on simulator → normalises → publishes to Redis `mars.sensors`.
2. **Caching**: Ingestion also writes latest reading to Redis Key `sensor:<sensor_id>` for fast snapshot reads.
3. **Rule Evaluation**: `Rules Engine` subscribes to `mars.sensors`, evaluates all stored rules, POSTs to simulator actuators.
4. **API Gateway**: Subscribes to `mars.sensors` and fans out events to WebSocket clients. Serves REST snapshots from Redis cache.
5. **Frontend**: Opens WebSocket to API Gateway for live updates; uses REST for initial load and rule CRUD.

## Service Responsibilities Matrix

| Concern | Ingestion | Rules Engine | API Gateway | Frontend |
|:--------|:---------:|:------------:|:-----------:|:--------:|
| Poll simulator REST | ✓ | | | |
| Normalise payload | ✓ | | | |
| Publish to Redis | ✓ | | | |
| Evaluate rules | | ✓ | | |
| Persist rules (SQLite) | | ✓ | | |
| Trigger actuators (auto) | | ✓ | | |
| Trigger actuators (manual) | | | ✓ | |
| Serve WebSocket stream | | | ✓ | |
| Rule CRUD REST API | | ✓ | proxy | |
| Sensor snapshot REST API | | | ✓ | |
| Render live dashboard | | | | ✓ |
| Connectivity badge | ✓ (write) | | ✓ (read) | ✓ (show) |
