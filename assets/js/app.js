/* global L */
(() => {

  /* =========================================================
     GLOBAL STATE
  ========================================================= */
  const STATE = {
    map: null,
    currentViewBounds: null,

    basemap: {
      current: null,
      layers: {}
    },

    layers: {
      odPolygon: null,
      odFlow: null,
      tripRoute: null,
      facilities: {
        bus_stop: null,
        bus_route: null,
        rail_stop: null,
        rail_route: null
      }
    }
  };

  /* =========================================================
     MAP INIT
  ========================================================= */
  function initMap() {
    STATE.map = L.map("map", { zoomControl: true })
      .setView([40.758, -111.89], 12);

    STATE.basemap.layers.light = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO" }
    );

    STATE.basemap.layers.dark = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO" }
    );

    STATE.basemap.current = STATE.basemap.layers.light;
    STATE.basemap.current.addTo(STATE.map);
  }

  function switchBasemap(name) {
    const next = STATE.basemap.layers[name];
    if (!next || next === STATE.basemap.current) return;

    STATE.map.removeLayer(STATE.basemap.current);
    next.addTo(STATE.map);
    STATE.basemap.current = next;

    document.querySelectorAll(".bm-btn").forEach(btn =>
      btn.classList.toggle("active", btn.dataset.basemap === name)
    );
  }

  /* =========================================================
     CORE LAYERS
  ========================================================= */
  function initLayers() {
    STATE.layers.odPolygon = L.layerGroup().addTo(STATE.map);
    STATE.layers.odFlow = L.layerGroup().addTo(STATE.map);
    STATE.layers.tripRoute = L.layerGroup().addTo(STATE.map);

    Object.keys(STATE.layers.facilities).forEach(k => {
      STATE.layers.facilities[k] = L.layerGroup();
    });
  }

  /* =========================================================
     DRAW OD POLYGON
  ========================================================= */
  function drawODPolygon(od) {
    STATE.layers.odPolygon.clearLayers();
    if (!od?.origin?.geometry || !od?.destination?.geometry) return;

    L.geoJSON(od.origin.geometry, {
      style: { color: "#2563eb", weight: 2, fillOpacity: 0.15 }
    }).bindPopup("Origin").addTo(STATE.layers.odPolygon);

    L.geoJSON(od.destination.geometry, {
      style: { color: "#dc2626", weight: 2, fillOpacity: 0.15 }
    }).bindPopup("Destination").addTo(STATE.layers.odPolygon);
  }

  /* =========================================================
     DRAW SAMPLE TRIPS
  ========================================================= */
  const linkedTripLayers = new Map();

  function drawSampleTrips(trips) {
    STATE.layers.tripRoute.clearLayers();
    linkedTripLayers.clear();

    let bounds = null;

    trips.forEach(t => {
      const g = L.layerGroup().addTo(STATE.layers.tripRoute);
      linkedTripLayers.set(t.linked_trip_id, g);

      t.legs?.forEach(leg => {
        if (!leg.route || leg.route.length < 2) return;

        const color =
          leg.mode === "rail" ? "#e23c1b"
          : leg.mode === "bus" ? "#2563eb"
          : leg.mode === "car" ? "#6d28d9"
          : leg.mode === "walk_bike" ? "#16a34a"
          : "#6b7280";

        const line = L.polyline(leg.route, {
          color,
          weight: 3,
          opacity: 0.85
        }).addTo(g);

        bounds = bounds ? bounds.extend(line.getBounds()) : line.getBounds();
      });

      t.transfers?.forEach((p, i) => {
        L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: "#2563eb",
          dashArray: "4,3",
          fillOpacity: 0.9
        }).bindPopup(`Transfer ${i + 1}`).addTo(g);
      });
    });

    if (bounds) {
      STATE.currentViewBounds = bounds;
      STATE.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  /* =========================================================
     FACILITIES
  ========================================================= */
  function normalizeStopMode(m) {
    if (!m) return null;
    m = m.toLowerCase();
    if (m.includes("bus")) return "bus";
    if (m.includes("trax") || m.includes("rail")) return "rail";
    return null;
  }

  async function loadFacilities() {
    const stops = await fetch("data/UTA/UTA_Stops.geojson").then(r => r.json());

    L.geoJSON(stops, {
      pointToLayer: (f, latlng) => {
        const mode = normalizeStopMode(f.properties.mode);
        if (!mode) return null;

        return L.circleMarker(latlng, {
          radius: 4,
          color: mode === "bus" ? "#2563eb" : "#7c3aed",
          fillOpacity: 0.9
        }).bindPopup(f.properties.stop_name);
      },
      onEachFeature: (f, l) => {
        const mode = normalizeStopMode(f.properties.mode);
        if (mode === "bus") l.addTo(STATE.layers.facilities.bus_stop);
        if (mode === "rail") l.addTo(STATE.layers.facilities.rail_stop);
      }
    });
  }

  function bindFacilityCheckboxes() {
    document.querySelectorAll("input[data-layer]").forEach(cb => {
      cb.addEventListener("change", e => {
        const layer = STATE.layers.facilities[e.target.dataset.layer];
        if (!layer) return;

        e.target.checked
          ? layer.addTo(STATE.map)
          : STATE.map.removeLayer(layer);
      });
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    initMap();
    initLayers();
    await loadFacilities();
    bindFacilityCheckboxes();

    document.querySelectorAll(".bm-btn").forEach(btn =>
      btn.addEventListener("click", () =>
        switchBasemap(btn.dataset.basemap)
      )
    );

    const sample = await fetch("data/samples/samples_center2air.json")
      .then(r => r.json());

    drawODPolygon(sample.od);
    drawSampleTrips(sample.linked_trips);
  }

  init();

})();