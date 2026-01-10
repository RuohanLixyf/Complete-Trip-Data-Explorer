# =========================
# CONFIG
# =========================
BASE_DIR = "C:/Users/rli04/Villanova University/Complete-trip-coordinate - Documents/General"
PARQUET_DIR = f"{BASE_DIR}/Salt_Lake/delivery"
TRACT_SHP = f"{BASE_DIR}/Manuscript/Figure/Visualization-RL/2-OD patterns by census track/six_counties_track.shp"

TRACTS = {
    "49035114000": "center",
    "49035980000": "airport",
    "49035110106": "canyon",
    "49035101402": "uofu"
}

MONTHS = ["Jan"]

MAX_DIST_M = 800
MAX_DIST_MILE = 1.0

# =========================
# IMPORTS
# =========================
import pandas as pd
import numpy as np
import geopandas as gpd
import pygeohash as pgh
from shapely.geometry import Point, LineString
from shapely import wkt
import glob
import json
from datetime import datetime, timedelta
from collections import defaultdict
import math
import json
from shapely.geometry import mapping

# =========================
# UTILS
# =========================
def haversine_miles(lon1, lat1, lon2, lat2):
    R = 3958.8
    lon1, lat1, lon2, lat2 = map(np.radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    return 2 * R * np.arcsin(np.sqrt(a))

def haversine_m(lon1, lat1, lon2, lat2):
    return haversine_miles(lon1, lat1, lon2, lat2) * 1609.34

def is_finite(x):
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)

def safe_decode_geohash(gh):
    try:
        lat, lon = pgh.decode(gh)
        if is_finite(lat) and is_finite(lon):
            return lon, lat
    except:
        pass
    return None, None

# =========================
# >>> ADDED 1: LOAD NODE TABLES <<<
# =========================
auto_nodes = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/auto-biggest-connected-graph/node.csv"
)
walk_nodes = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/walk-biggest-connected-graph/node.csv"
)
transit_nodes = pd.read_csv(
    f"{BASE_DIR}/Salt_Lake/supplementInputs/network/UTA/node with flow.csv"
)

auto_node_dict = dict(zip(auto_nodes.osm_node_id, zip(auto_nodes.x_coord, auto_nodes.y_coord)))
walk_node_dict = dict(zip(walk_nodes.osm_node_id, zip(walk_nodes.x_coord, walk_nodes.y_coord)))
transit_node_dict = dict(zip(transit_nodes.node_id, zip(transit_nodes.x_coord, transit_nodes.y_coord)))

def get_node_coord(osm_id, mode):
    if mode == "car":
        return auto_node_dict.get(osm_id)
    if mode == "walk/bike":
        return walk_node_dict.get(osm_id)
    if mode in ["bus", "rail"]:
        return transit_node_dict.get(osm_id)
    return None

# =========================
# MAIN LOOP (12 ODs)
# =========================
for ORIG_TRACT in TRACTS:
    for DEST_TRACT in TRACTS:
        if ORIG_TRACT == DEST_TRACT:
            continue

        print(f"\n=== Processing {ORIG_TRACT} → {DEST_TRACT} ===")

        OUTPUT_JSON = f"{ORIG_TRACT}_to_{DEST_TRACT}.json"

        USE_COLS = [
            "linked_trip_id", "trip_id", "tour_id",
            "travel_mode", "local_datetime_start", "local_datetime_end",
            "network_distance", "route_distance",
            "geohash7_orig", "geohash7_dest",
            "access_stop", "access_stop_id",
            "egress_stop", "egress_stop_id",
            "trip_purpose", "trip_weight",
            "route_taken"
        ]

        MONTHLY_DFS = []

        for m in MONTHS:
            files = glob.glob(f"{PARQUET_DIR}/Salt_Lake-{m}-2020/*.snappy.parquet")
            dfs = [pd.read_parquet(f, columns=USE_COLS) for f in files]
            df_month = pd.concat(dfs, ignore_index=True)

            df_month["local_datetime_start"] = pd.to_datetime(df_month["local_datetime_start"])
            df_month["local_datetime_end"] = pd.to_datetime(df_month["local_datetime_end"])
            df_month = df_month[df_month["local_datetime_end"] > df_month["local_datetime_start"]]

            df_month["duration_min"] = (
                df_month["local_datetime_end"] - df_month["local_datetime_start"]
            ).dt.total_seconds() / 60

            MONTHLY_DFS.append(df_month)

        df = pd.concat(MONTHLY_DFS, ignore_index=True)
        df = df.sort_values(["linked_trip_id", "local_datetime_start"])

        # =========================
        # >>> ADDED 2: GEOHASH–ROUTE CONSISTENCY FILTER <<<
        # =========================
        bad_linked = set()

        for r in df.itertuples():
            nodes = [
                int(x) for x in str(r.route_taken).split(",")
                if x.strip().isdigit() and int(x) != -1
            ]
            if not nodes:
                bad_linked.add(r.linked_trip_id)
                continue

            first_node, last_node = nodes[0], nodes[-1]

            coord_first = get_node_coord(first_node, r.travel_mode)
            coord_last = get_node_coord(last_node, r.travel_mode)

            o_lon, o_lat = safe_decode_geohash(r.geohash7_orig)
            d_lon, d_lat = safe_decode_geohash(r.geohash7_dest)

            if coord_first and o_lon is not None:
                dist_m = haversine_m(o_lon, o_lat, coord_first[0], coord_first[1])
                if dist_m > MAX_DIST_M or dist_m / 1609.34 > MAX_DIST_MILE:
                    bad_linked.add(r.linked_trip_id)
                    continue

            if coord_last and d_lon is not None:
                dist_m = haversine_m(d_lon, d_lat, coord_last[0], coord_last[1])
                if dist_m > MAX_DIST_M or dist_m / 1609.34 > MAX_DIST_MILE:
                    bad_linked.add(r.linked_trip_id)
                    continue

        df = df[~df["linked_trip_id"].isin(bad_linked)]
        print(f"After geohash-route filter: {df['linked_trip_id'].nunique()} linked trips")

        # =========================
        # 后续代码：你原来的 geometry / build_route / sample / JSON
        # 【保持不变，直接接你已有的】
        # =========================

        # load networks
        auto_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/auto-biggest-connected-graph/link.csv")
        walk_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/walk-biggest-connected-graph/link.csv")
        transit_links = pd.read_csv(f"{BASE_DIR}/Salt_Lake/supplementInputs/network/UTA/link with flow.csv")

        auto_dict = {
            (int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry
            for r in auto_links.itertuples()
        }
        transit_dict = {
            (int(r.from_node_id), int(r.to_node_id)): r.geometry
            for r in transit_links.itertuples()
        }
        walk_dict = {
            (int(r.from_osm_node_id), int(r.to_osm_node_id)): r.geometry
            for r in walk_links.itertuples()
        }
        def build_geometry(row):
            nodes = [int(x) for x in str(row.route_taken).split(",") if x.strip().isdigit()]
            if len(nodes) < 2:
                return None

            coords = []
            link_dict = (
                auto_dict if row.travel_mode == "car"
                else walk_dict if (row.travel_mode == "walk/bike")
                else transit_dict if row.travel_mode in ["bus", "rail"]
                else None
            )
            for a, b in zip(nodes[:-1], nodes[1:]):
                if (a, b) in link_dict:
                    try:
                        geom = wkt.loads(link_dict[(a, b)])
                        coords.extend(list(geom.coords))
                    except:
                        continue
            return LineString(coords) if len(coords) > 1 else None

        df["geometry"] = df.apply(build_geometry, axis=1)
        df = df[df["geometry"].notnull()]


        def is_finite(x):
            return x is not None and isinstance(x, (int, float)) and math.isfinite(x)

        def clean_num(x):
            return float(x) if is_finite(x) else None

        def safe_decode_geohash(gh):
            try:
                lat, lon = pgh.decode(gh)
                if is_finite(lat) and is_finite(lon):
                    return lon, lat
            except Exception:
                pass
            return None, None

        def build_route(geom):
            if geom is None:
                return None

            coords = []
            for lon, lat in geom.coords:
                if not is_finite(lat) or not is_finite(lon):
                    continue
                coords.append([float(lat), float(lon)])

            if len(coords) < 2:
                return None

            # demo 抽稀
            if len(coords) > 400:
                coords = coords[::3]

            return coords
        def to_iso(t):
            if t is None:
                return None
            if hasattr(t, "isoformat"):
                return t.isoformat()
            return str(t)



        # =========================
        # 1️⃣ BUILD ALL LEG SAMPLES（仅补 end_time）
        # =========================

        samples = []

        for r in df.itertuples():
            route = build_route(r.geometry)
            if route is None:
                continue

            o_lon, o_lat = safe_decode_geohash(r.geohash7_orig)
            d_lon, d_lat = safe_decode_geohash(r.geohash7_dest)

            start_dt = r.local_datetime_start
            duration = clean_num(r.duration_min)

            end_dt = (
                start_dt + timedelta(minutes=duration)
                if start_dt is not None and duration is not None
                else None
            )

            samples.append({
                "id": str(r.trip_id),
                "mode": str(r.travel_mode).lower().strip(),
                "route": route,
                "start_time": to_iso(start_dt),
                "end_time": to_iso(end_dt),              # ✅ 新增
                "duration_min": duration,
                "network_distance_km": clean_num(r.network_distance),
                "route_distance_km": clean_num(r.route_distance),
                "origin": {
                    "lon": o_lon,
                    "lat": o_lat,
                    "geohash": r.geohash7_orig
                },
                "destination": {
                    "lon": d_lon,
                    "lat": d_lat,
                    "geohash": r.geohash7_dest
                },
                "access": {
                    "stop_id": clean_num(r.access_stop_id),
                    "stop_name": r.access_stop
                },
                "egress": {
                    "stop_id": clean_num(r.egress_stop_id),
                    "stop_name": r.egress_stop
                },
                "meta": {
                    "linked_trip_id": r.linked_trip_id,
                    "tour_id": r.tour_id,
                    "purpose": r.trip_purpose,
                    "weight": clean_num(r.trip_weight)
                }
            })

        # =========================
        # 2️⃣ GROUP BY linked_trip（不变）
        # =========================

        linked_groups = defaultdict(list)
        for s in samples:
            linked_groups[s["meta"]["linked_trip_id"]].append(s)

        # =========================
        # 3️⃣ BUILD FULL linked_trip STRUCTURE（仅修 end_time 语义）
        # =========================

        linked_trips_full = []

        for linked_id, trips in linked_groups.items():

            trips_sorted = sorted(trips, key=lambda x: x["start_time"])

            # 给每个 leg 顺序索引
            for i, t in enumerate(trips_sorted):
                t["leg_index"] = i

            origin = {
                **trips_sorted[0]["origin"],
                "start_time": trips_sorted[0]["start_time"]
            }

            destination = {
                **trips_sorted[-1]["destination"],
                "end_time": trips_sorted[-1].get("end_time")   # ✅ 修正
            }

            transfers = []
            for t in trips_sorted[:-1]:
                if t["destination"]["lat"] is not None and t["destination"]["lon"] is not None:
                    transfers.append({
                        "lat": t["destination"]["lat"],
                        "lon": t["destination"]["lon"],
                        "geohash": t["destination"]["geohash"]
                    })

            weight = max(t["meta"]["weight"] or 0 for t in trips_sorted)

            linked_trips_full.append({
                "linked_trip_id": linked_id,
                "origin": origin,
                "destination": destination,
                "transfers": transfers,
                "legs": trips_sorted,
                "weight": weight
            })

        # =========================
        # 4️⃣ SAMPLE linked_trip（不变）
        # =========================

        linked_trips_sorted = sorted(
            linked_trips_full,
            key=lambda lt: -lt["weight"]
        )

        linked_trips_final = linked_trips_sorted

        # =========================
        # 5️⃣ OD TRACT → GEOJSON（不变）
        # =========================

        tracts["GEOID"] = tracts["GEOID"].astype(str)

        origin_tract = tracts.loc[tracts["GEOID"] == ORIG_TRACT]
        dest_tract   = tracts.loc[tracts["GEOID"] == DEST_TRACT]

        if len(origin_tract) != 1 or len(dest_tract) != 1:
            raise ValueError("OD tract not uniquely identified")

        def geom_to_geojson(gdf):
            return mapping(gdf.geometry.iloc[0])

        od_info = {
            "origin": {
                "tract_id": ORIG_TRACT,
                "geometry": geom_to_geojson(origin_tract)
            },
            "destination": {
                "tract_id": DEST_TRACT,
                "geometry": geom_to_geojson(dest_tract)
            }
        }

        # =========================
        # 6️⃣ FINAL OUTPUT（不变）
        # =========================

        out = {
            "schema": "nova.complete_trip.sample.v2",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "od": od_info,
            "count": len(linked_trips_final),
            "linked_trips": linked_trips_final
        }

        with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, allow_nan=False)
