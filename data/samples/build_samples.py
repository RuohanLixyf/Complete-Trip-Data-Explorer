import pandas as pd
import json
from shapely import wkt

# ===== Paths =====
META_CSV = "./data/samples/selected_linked_trips.csv"
GEOM_CSV = "./data/samples/selected_trips_with_geometry.csv"
OUT_JSON = "./samples.json"

# ===== Load =====
meta_df = pd.read_csv(META_CSV)
geom_df = pd.read_csv(GEOM_CSV)

# 统一 trip_id 字段名（如果不同可在这里改）
meta_df["trip_id"] = meta_df["trip_id"].astype(str)
geom_df["trip_id"] = geom_df["trip_id"].astype(str)

# ===== Merge =====
df = meta_df.merge(
    geom_df,
    on="trip_id",
    how="inner"
)

# ===== Helper: geometry to coords =====
def parse_geometry(val):
    """
    支持：
    - WKT LINESTRING
    - JSON string: [[lng, lat], ...]
    """
    if isinstance(val, str) and val.strip().startswith("LINESTRING"):
        geom = wkt.loads(val)
        return [[lat, lng] for lng, lat in geom.coords]

    try:
        coords = json.loads(val)
        return [[lat, lng] for lng, lat in coords]
    except Exception:
        return []

# ===== Build samples =====
samples = []

for _, r in df.iterrows():
    sample = {
        "trip_id": r["trip_id"],
        "linked": bool(r.get("linked", False)),
        "mode": r.get("mode", "Unknown"),
        "duration_min": r.get("duration_min", None),

        "access": {
            "type": r.get("access_type", None),
            "name": r.get("access_name", None),
            "lat": r.get("access_lat", None),
            "lng": r.get("access_lng", None)
        },
        "egress": {
            "type": r.get("egress_type", None),
            "name": r.get("egress_name", None),
            "lat": r.get("egress_lat", None),
            "lng": r.get("egress_lng", None)
        },

        "route": parse_geometry(r["full_geometry_wkt"])
    }

    samples.append(sample)

# ===== Output =====
out = {
    "meta": {
        "source": "UTA temporary samples",
        "count": len(samples)
    },
    "samples": samples
}

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

print(f"Saved {len(samples)} samples → {OUT_JSON}")