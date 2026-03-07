"""
Rules Engine Service
--------------------
- Subscribes to Redis `mars.sensors` channel.
- Evaluates stored IF-THEN rules on each event.
- Triggers actuator POST requests to the simulator when rules match.
- Exposes a REST API for rule CRUD (consumed by the API Gateway).
- Rules are persisted in SQLite via SQLAlchemy.
"""
import asyncio
import json
import operator as op
import os
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Float, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# ── Config ────────────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080/api")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/rules.db")

OPERATORS = {
    "<": op.lt,
    "<=": op.le,
    "=": op.eq,
    ">": op.gt,
    ">=": op.ge,
}

# ── Database ──────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class Rule(Base):
    __tablename__ = "rules"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sensor_id = Column(String, nullable=False)
    operator = Column(String, nullable=False)
    threshold = Column(Float, nullable=False)
    actuator_id = Column(String, nullable=False)
    action = Column(String, nullable=False)  # ON | OFF
    created_at = Column(String, nullable=False)


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)

# ── In-memory rule cache ──────────────────────────────────────────────────────
_rules_cache: list[dict] = []


def _load_rules_cache():
    global _rules_cache
    with SessionLocal() as session:
        rows = session.query(Rule).all()
        _rules_cache = [
            {
                "id": r.id,
                "sensor_id": r.sensor_id,
                "operator": r.operator,
                "threshold": r.threshold,
                "actuator_id": r.actuator_id,
                "action": r.action,
                "created_at": r.created_at,
            }
            for r in rows
        ]


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Mars Rules Engine")


@app.on_event("startup")
async def startup():
    _load_rules_cache()
    asyncio.create_task(subscriber_loop())


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Rule CRUD ─────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    sensor_id: str
    operator: str
    threshold: float
    actuator_id: str
    action: str  # ON | OFF


@app.get("/rules")
def list_rules():
    return _rules_cache


@app.post("/rules", status_code=201)
async def create_rule(body: RuleCreate):
    if body.operator not in OPERATORS:
        raise HTTPException(400, f"Invalid operator '{body.operator}'. Use one of {list(OPERATORS)}")
    if body.action not in ("ON", "OFF"):
        raise HTTPException(400, "action must be ON or OFF")

    with SessionLocal() as session:
        rule = Rule(
            sensor_id=body.sensor_id,
            operator=body.operator,
            threshold=body.threshold,
            actuator_id=body.actuator_id,
            action=body.action,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        session.add(rule)
        session.commit()
        session.refresh(rule)
        result = {
            "id": rule.id,
            "sensor_id": rule.sensor_id,
            "operator": rule.operator,
            "threshold": rule.threshold,
            "actuator_id": rule.actuator_id,
            "action": rule.action,
            "created_at": rule.created_at,
        }
    _load_rules_cache()
    # Immediately evaluate the new rule against the current cached sensor value
    await _fire_rule_if_matched(result)
    return result


async def _fire_rule_if_matched(rule: dict):
    """Check the current Redis sensor cache and fire the actuator if the rule matches."""
    try:
        redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        raw = await redis.get(f"sensor:{rule['sensor_id']}")
        await redis.aclose()
        if not raw:
            return
        event = json.loads(raw)
        value = event.get("value")
        if value is None:
            return
        compare = OPERATORS.get(rule["operator"])
        if compare and compare(value, rule["threshold"]):
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{SIMULATOR_URL}/actuators/{rule['actuator_id']}",
                    json={"state": rule["action"]},
                )
            print(f"[rules-engine] Rule #{rule['id']} immediately fired: {rule['actuator_id']} → {rule['action']}")
    except Exception as exc:
        print(f"[rules-engine] Immediate rule evaluation failed: {exc}")


@app.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int):
    with SessionLocal() as session:
        rule = session.get(Rule, rule_id)
        if not rule:
            raise HTTPException(404, "Rule not found")
        session.delete(rule)
        session.commit()
    _load_rules_cache()


# ── Subscriber loop ───────────────────────────────────────────────────────────

async def subscriber_loop():
    """Subscribe to mars.sensors and evaluate rules. Retries on any failure."""
    while True:
        try:
            redis = aioredis.from_url(REDIS_URL, decode_responses=True)
            async with httpx.AsyncClient(timeout=5.0) as client:
                pubsub = redis.pubsub()
                await pubsub.subscribe("mars.sensors")
                print("[rules-engine] Subscribed to mars.sensors")
                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    try:
                        event = json.loads(message["data"])
                        await evaluate_rules(event, client)
                    except Exception as exc:
                        print(f"[rules-engine] Error processing event: {exc}")
        except Exception as exc:
            print(f"[rules-engine] Subscriber loop crashed: {exc}. Retrying in 5s...")
            await asyncio.sleep(5)


async def evaluate_rules(event: dict, client: httpx.AsyncClient):
    sensor_id = event.get("sensor_id")
    value = event.get("value")
    if value is None:
        return

    for rule in _rules_cache:
        if rule["sensor_id"] != sensor_id:
            continue
        compare = OPERATORS.get(rule["operator"])
        if compare and compare(value, rule["threshold"]):
            try:
                await client.post(
                    f"{SIMULATOR_URL}/actuators/{rule['actuator_id']}",
                    json={"state": rule["action"]},
                )
                print(f"[rules-engine] Rule #{rule['id']} fired: {rule['actuator_id']} → {rule['action']}")
            except Exception as exc:
                print(f"[rules-engine] Failed to actuate {rule['actuator_id']}: {exc}")
