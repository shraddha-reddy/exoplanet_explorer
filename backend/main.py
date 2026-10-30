import json, os
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

from metrics import enrich

load_dotenv()

app = FastAPI(title="Exoplanet Explorer")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATA_FILE = "exoplanets.json"
NASA_URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
NASA_QUERY = """
select pl_name, hostname, discoverymethod, disc_year, sy_dist,
       pl_rade, pl_bmasse, pl_orbper, pl_orbsmax, pl_eqt, pl_insol,
       st_teff, st_rad, st_mass, sy_pnum, ra, dec
from pscomppars
where pl_rade is not null and sy_dist is not null
"""

PLANETS: list = []
BY_NAME: dict = {}
INSIGHT_CACHE: dict = {}


def load_planets(raw):
    global PLANETS, BY_NAME
    PLANETS = [enrich(p) for p in raw]
    BY_NAME = {p["pl_name"].lower(): p for p in PLANETS}
    INSIGHT_CACHE.clear()


with open(DATA_FILE) as f:
    load_planets(json.load(f))

client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"),
    api_key=os.getenv("LLM_API_KEY", "none"),
)
MODEL = os.getenv("LLM_MODEL", "")

SYSTEM_PROMPT = """You are a friendly virtual astronomer. Explain exoplanets clearly to curious non-experts.
Rules:
- Use ONLY the planet data provided below for facts and numbers. Never invent values.
- Every value in the data has its unit written next to it. Always repeat the unit when you state a number, and report temperatures exactly as given (Kelvin with the Celsius equivalent).
- Never say a planet "is habitable". Say whether it is in the habitable zone and how Earth-like it is, quoting its ESI and equilibrium temperature with units.
- Equilibrium temperature is the temperature a planet would have from its star's light alone, with no atmosphere or greenhouse effect. Describe it exactly that way.
- Always quote at least two numbers from the data in your answer.
- If a value is null/missing, say it is unknown.
- ESI (Earth Similarity Index) and habitable-zone status are precomputed; explain them, don't recompute.
- Equilibrium temperature is not surface temperature; mention this when discussing habitability.
- Habitability here means Earth-likeness, not evidence of life. Be honest about uncertainty.
- Keep answers concise.
- Use only facts from the data. Do not speculate about atmosphere, greenhouse effects, or surface conditions.
- Never call life likely or promising. Say the data cannot tell us whether life exists.
- Equilibrium temperature is not surface temperature. Don’t describe the surface."""


def get_or_404(name: str):
    p = BY_NAME.get(name.lower())
    if not p:
        raise HTTPException(404, f"Planet not found: {name}")
    return p
def describe(p):
    k = p.get("pl_eqt")
    temp = "unknown" if k is None else f"{round(k, 1)} K ({round(k - 273.15, 1)} °C)"
    pc = p.get("sy_dist")
    dist = "unknown" if pc is None else f"{round(pc, 2)} parsecs ({round(pc * 3.2616, 1)} light-years)"

    def val(key, unit, nd=3):
        v = p.get(key)
        if v is None:
            return "unknown"
        return f"{round(v, nd) if isinstance(v, float) else v} {unit}".strip()

    esi = p.get("esi")
    esi_txt = "unknown" if esi is None else f"{esi} (computed from {p.get('esi_factors')} of 4 factors)"
    return "\n".join([
        f"Name: {p.get('pl_name')}",
        f"Host star: {p.get('hostname')}",
        f"Planet type: {p.get('type')}",
        f"Discovered: {p.get('disc_year')} via {p.get('discoverymethod')}",
        f"Distance from Earth: {dist}",
        f"Radius: {val('pl_rade', 'Earth radii')}",
        f"Mass: {val('pl_bmasse', 'Earth masses')}",
        f"Orbital period: {val('pl_orbper', 'days')}",
        f"Orbital distance from star: {val('pl_orbsmax', 'AU')}",
        f"Equilibrium temperature: {temp}",
        f"Starlight received: {val('pl_insol', 'x Earth')}",
        f"Star temperature: {val('st_teff', 'K', 0)}",
        f"Star radius: {val('st_rad', 'solar radii')}",
        f"Star mass: {val('st_mass', 'solar masses')}",
        f"Earth Similarity Index: {esi_txt}",
        f"Habitable zone status: {p.get('hz_status')}",
    ])

def ask_llm(messages):
    try:
        resp = client.chat.completions.create(model=MODEL, messages=messages, temperature=0.4)
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")
    return resp.choices[0].message.content


# ---------- data endpoints ----------

CARD_KEYS = ["pl_name", "hostname", "sy_dist", "pl_rade", "pl_orbper", "pl_eqt",
             "ra", "dec", "type", "esi", "esi_factors", "hz_status", "discoverymethod", "disc_year"]


def card(p):
    return {k: p.get(k) for k in CARD_KEYS}


@app.get("/planets")
def list_planets(
    q: Optional[str] = None,           # search by planet or star name
    type: Optional[str] = None,        # Earth-sized / Super-Earth / Neptune-like / Gas giant
    habitable: bool = False,           # only planets in the habitable zone
    min_esi: Optional[float] = None,
    max_dist: Optional[float] = None,  # parsecs
    sort: str = "name",                # name | esi | distance
    limit: int = 0,                    # 0 = no limit
):
    res = PLANETS
    if q:
        ql = q.lower()
        res = [p for p in res if ql in p["pl_name"].lower() or ql in (p.get("hostname") or "").lower()]
    if type:
        res = [p for p in res if p["type"].lower() == type.lower()]
    if habitable:
        res = [p for p in res if p["hz_status"] == "In habitable zone"]
    if min_esi is not None:
        res = [p for p in res if p["esi"] is not None and p["esi"] >= min_esi]
    if max_dist is not None:
        res = [p for p in res if p["sy_dist"] is not None and p["sy_dist"] <= max_dist]
    if sort == "esi":
        res = sorted(res, key=lambda p: p["esi"] if p["esi"] is not None else -1, reverse=True)
    elif sort == "distance":
        res = sorted(res, key=lambda p: p["sy_dist"])
    else:
        res = sorted(res, key=lambda p: p["pl_name"])
    if limit:
        res = res[:limit]
    return [card(p) for p in res]


@app.get("/planets/{name}")
def get_planet(name: str):
    return get_or_404(name)


@app.get("/compare")
def compare(a: str, b: str):
    pa, pb = get_or_404(a), get_or_404(b)
    fields = ["pl_rade", "pl_bmasse", "pl_orbper", "pl_orbsmax", "pl_eqt", "flux", "sy_dist", "esi"]
    rows = [{"field": f, "a": pa.get(f), "b": pb.get(f)} for f in fields]
    more_earthlike = None
    if pa["esi"] is not None and pb["esi"] is not None:
        more_earthlike = pa["pl_name"] if pa["esi"] >= pb["esi"] else pb["pl_name"]
    return {"a": pa, "b": pb, "rows": rows, "more_earthlike": more_earthlike}


@app.get("/featured")
def featured(n: int = 10):
    full = [p for p in PLANETS if p["esi"] is not None and p["esi_factors"] == 4]
    top = sorted(full, key=lambda p: p["esi"], reverse=True)[:n]
    return [card(p) for p in top]


@app.get("/stats")
def stats():
    by_type = {}
    for p in PLANETS:
        by_type[p["type"]] = by_type.get(p["type"], 0) + 1
    return {
        "total": len(PLANETS),
        "habitable_zone": sum(1 for p in PLANETS if p["hz_status"] == "In habitable zone"),
        "by_type": by_type,
        "nearest": card(min(PLANETS, key=lambda p: p["sy_dist"])),
    }


@app.post("/refresh")
def refresh():
    """Re-download the latest data from NASA and reload it."""
    try:
        r = requests.get(NASA_URL, params={"query": NASA_QUERY, "format": "json"}, timeout=60)
        r.raise_for_status()
        raw = r.json()
    except Exception as e:
        raise HTTPException(502, f"NASA fetch failed: {e}")
    with open(DATA_FILE, "w") as f:
        json.dump(raw, f)
    load_planets(raw)
    return {"planets": len(PLANETS)}


# ---------- AI endpoints ----------

@app.get("/insight/{name}")
def insight(name: str):
    p = get_or_404(name)
    key = p["pl_name"]
    if key not in INSIGHT_CACHE:
        prompt = ("In 3 short sentences: what kind of world is this, what is most notable about it, "
                  "and how Earth-like is it (explain the ESI and habitable-zone result)?")
        messages = [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nPLANET DATA:\n{describe(p)}"},
            {"role": "user", "content": prompt},
        ]
        INSIGHT_CACHE[key] = ask_llm(messages)
    return {"planet": key, "insight": INSIGHT_CACHE[key]}


class ChatRequest(BaseModel):
    message: str
    planets: list[str] = []      # 1 name = explain, 2+ = compare
    history: list[dict] = []


@app.post("/chat")
def chat(req: ChatRequest):
    records = [BY_NAME[n.lower()] for n in req.planets if n.lower() in BY_NAME]
    context = "\n\n".join(describe(p) for p in records) if records else "No planet selected."
    messages = [{"role": "system", "content": f"{SYSTEM_PROMPT}\n\nPLANET DATA:\n{context}"}]
    messages += [
        {"role": m["role"], "content": str(m.get("content", ""))[:2000]}
        for m in req.history[-6:] if m.get("role") in ("user", "assistant")
    ]
    messages.append({"role": "user", "content": req.message})
    return {"reply": ask_llm(messages)}