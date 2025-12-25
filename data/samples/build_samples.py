import pandas as pd
import json
from shapely import wkt
from datetime import datetime

# =========================
# Paths
# =========================
META_CSV = "./data/samples/selected_linked_trips.csv"
GEOM_CSV = "./data/samples/selected_trips_with_geometry.csv"
OUT_JSON = "./data/samples/samples.json"

# =========================
# Load data
# =========================
meta_df = pd.read_csv(META_CSV)
geom_df = pd.read_csv(GEOM_CSV)

# 统一 trip_id 类型
meta_df["trip_id"] = meta_df["trip_id"].astype(str)
geom_df["trip_id"] = geom_df["trip_id"].astype(str)

# =========================
# Merge
# =========================
df = meta_df.merge(
    geom_df[["trip_id", "full_geometry_wkt"]],
    on="trip_id",
    how="inner"
)

# =========================
# Geometry parser
# =========================
def parse_geometry(val, trip_id):
    """
    仅支持 WKT LINESTRING
    返回 [[lat, lng], ...]
    """
    if not isinstance(val, str) or not val.startswith("LINESTRING"):
        print(f"[WARN] Missing or invalid geometry for trip {trip_id}")
        return None

    try:
        geom = wkt.loads(val)
        coords = [[lat, lng] for lng, lat in geom.coords]

        # 🔧 简单抽稀，减轻前端压力
        if len(coords) > 300:
            coords = coords[::3]

        return coords

    except Exception as e:
        print(f"[ERROR] Geometry parse failed for trip {trip_id}: {e}")
        return None

# =========================
# Duration helper
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
    if "rail" in m:
        return "rail"
    if "bus" in m:
        return "bus"
    if "walk" in m:
        return "walk"
    if "bike" in m:
        return "bike"
    return m

# =========================
# Build samples
# =========================
samples = []

for _, r in df.iterrows():
    route = parse_geometry(r["full_geometry_wkt"], r["trip_id"])
    if not route:
        continue  # ❗没有 geometry 的直接丢掉

    duration_min = compute_duration_min(r)

    sample = {
        # ===== Frontend-friendly core =====
        "id": r["trip_id"],
        "mode": normalize_mode(r.get("travel_mode")),
        "duration": f"{duration_min} min" if duration_min else None,
        "route": route,

        # ===== Optional metadata =====
        "meta": {
            "linked_trip_id": r.get("linked_trip_id"),
            "tour_id": r.get("tour_id"),
            "purpose": r.get("trip_purpose"),
            "weight": r.get("trip_weight"),
            "network_distance": r.get("network_distance"),
            "route_distance": r.get("route_distance")
        },

        # ===== Access / Egress (ID-level only, safe) =====
        "access": {
            "stop_id": r.get("access_stop_id"),
            "name": r.get("access_stop")
        },
        "egress": {
            "stop_id": r.get("egress_stop_id"),
            "name": r.get("egress_stop")
        }
    }

    samples.append(sample)

# =========================
# Output JSON
# =========================
out = {
    "schema": "complete-trip-sample-v1",
    "meta": {
        "source": "UTA linked trip samples",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "count": len(samples)
    },
    "samples": samples
}

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

print(f"✅ Saved {len(samples)} samples → {OUT_JSON}")
