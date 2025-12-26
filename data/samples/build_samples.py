import pandas as pd
import json
from shapely import wkt
from datetime import datetime

# =========================
# Paths
# =========================
CSV_PATH = "./data/samples/selected_linked_trips.csv"
OUT_JSON = "./data/samples/samples.json"

# =========================
# Load data
# =========================
df = pd.read_csv(CSV_PATH)

# 统一把所有 NaN → None，保证 JSON 不会出现 NaN
df = df.where(pd.notnull(df), None)

# 强制字符串 ID（安全）
df["trip_id"] = df["trip_id"].astype(str)

# =========================
# Geometry parser
# =========================
def parse_geometry(wkt_str, trip_id):
    """Parse LINESTRING WKT → [[lat, lng], ...] for Leaflet"""
    if not isinstance(wkt_str, str) or not wkt_str.startswith("LINESTRING"):
        print(f"[WARN] Invalid geometry for trip {trip_id}")
        return None

    try:
        geom = wkt.loads(wkt_str)
        coords = [[lat, lng] for lng, lat in geom.coords]

        # 简单抽稀（demo）
        if len(coords) > 400:
            coords = coords[::3]

        return coords

    except Exception as e:
        print(f"[ERROR] Geometry parse failed for {trip_id}: {e}")
        return None


# =========================
# Duration (minutes)
# =========================
def compute_duration_min(row):
    try:
        t0 = pd.to_datetime(row["local_datetime_start"])
        t1 = pd.to_datetime(row["local_datetime_end"])
        return round((t1 - t0).total_seconds() / 60, 1)
    except Exception:
        return None


# =========================
# Mode normalization
# =========================
def normalize_mode(m):
    if not isinstance(m, str):
        return "unknown"

    m = m.lower()
    if m == "rail":
        return "rail"
    if m == "bus":
        return "bus"
    if "walk" in m or "bike" in m:
        return "walk_bike"
    return "other"


# =========================
# Helper: ensure no NaN sneaks in
# =========================
def clean(x):
    """Convert pandas NaN / None / float('nan') → None (JSON null)"""
    if x is None:
        return None
    if isinstance(x, float) and pd.isna(x):
        return None
    return x


# =========================
# Build samples
# =========================
samples = []

for _, r in df.iterrows():
    route = parse_geometry(r["full_geometry_wkt"], r["trip_id"])
    if route is None:
        continue

    duration = compute_duration_min(r)

    sample = {
        "id": r["trip_id"],
        "mode": normalize_mode(r["travel_mode"]),
        "route": route,

        # ===== Numeric attributes =====
        "duration_min": clean(duration),
        "network_distance_km": clean(r.get("network_distance")),
        "route_distance_km": clean(r.get("route_distance")),

        # ===== OD =====
        "origin": {
            "lon": clean(r.get("orig_lon")),
            "lat": clean(r.get("orig_lat")),
            "geohash": clean(r.get("geohash7_orig"))
        },
        "destination": {
            "lon": clean(r.get("dest_lon")),
            "lat": clean(r.get("dest_lat")),
            "geohash": clean(r.get("geohash7_dest"))
        },

        # ===== Transit context =====
        "access": {
            "stop_id": clean(r.get("access_stop_id")),
            "stop_name": clean(r.get("access_stop"))
        },
        "egress": {
            "stop_id": clean(r.get("egress_stop_id")),
            "stop_name": clean(r.get("egress_stop"))
        },

        # ===== Metadata =====
        "meta": {
            "linked_trip_id": clean(r.get("linked_trip_id")),
            "tour_id": clean(r.get("tour_id")),
            "purpose": clean(r.get("trip_purpose")),
            "weight": clean(r.get("trip_weight")),
            "trip_count": clean(r.get("trip_count"))
        }
    }

    samples.append(sample)

# =========================
# Output JSON
# =========================
out = {
    "schema": "nova.complete_trip.sample.v1",
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "count": len(samples),
    "samples": samples
}

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

print(f"✅ Saved {len(samples)} samples → {OUT_JSON}")
