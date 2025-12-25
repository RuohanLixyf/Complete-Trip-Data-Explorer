/* global L */

(function () {

  /* =========================
     Map init
  ========================= */
  const map = L.map("map", { zoomControl: true })
    .setView([40.758, -111.89], 12);

  // 🔥 清除任何残留 TileLayer（解决 dark / light 无效）
  map.eachLayer(layer => {
    if (layer instanceof L.TileLayer) {
      map.removeLayer(layer);
    }
  });

  const baseMaps = {
    light: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO" }
    ),
    dark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO" }
    )
  };

  let currentBasemap = "light";
  baseMaps[currentBasemap].addTo(map);

  function switchBasemap(name) {
    if (name === currentBasemap) return;

    Object.values(baseMaps).forEach(l => map.removeLayer(l));
    baseMaps[name].addTo(map);
    currentBasemap = name;

    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.basemap === name);
    });
  }

  /* =========================
     Mode normalization
  ========================= */
  function normalizeStopMode(mode) {
    if (!mode) return null;
    const m = mode.toLowerCase();
    if (m.includes("bus") || m.includes("micro")) return "bus";
    if (m.includes("trax") || m.includes("frontrunner")) return "rail";
    return null;
  }

  function normalizeRouteMode(routeType) {
    if (!routeType) return null;
    const railLines = [
      "blue line",
      "red line",
      "green line",
      "s line",
      "frontrunner"
    ];
    const t = routeType.toLowerCase();
    if (railLines.some(r => t.includes(r))) return "rail";
    return "bus";
  }

  /* =========================
     Core layers
  ========================= */
  const layers = {
    tripRoute: L.layerGroup().addTo(map),
    accessEgress: L.layerGroup().addTo(map)
  };

  const facilityLayers = {
    bus_stop: L.layerGroup(),
    rail_stop: L.layerGroup(),
    bus_route: L.layerGroup(),
    rail_route: L.layerGroup()
  };

  /* =========================
     Load facilities
  ========================= */
  async function loadStops() {
    const res = await fetch("data/UTA/UTA_Stops.geojson");
    const data = await res.json();

    facilityLayers.bus_stop.clearLayers();
    facilityLayers.rail_stop.clearLayers();

    L.geoJSON(data, {
      pointToLayer: (f, latlng) => {
        const mode = normalizeStopMode(f.properties.mode);
        if (!mode) return null;

        const marker = L.circleMarker(latlng, {
          radius: 4,
          color: mode === "bus" ? "#2563eb" : "#7c3aed",
          weight: 1,
          fillOpacity: 0.9
        }).bindPopup(
          `${f.properties.stop_name}<br><small>${f.properties.mode}</small>`
        );

        if (mode === "bus") marker.addTo(facilityLayers.bus_stop);
        if (mode === "rail") marker.addTo(facilityLayers.rail_stop);

        return marker;
      }
    });
  }

  async function loadRoutes() {
    const res = await fetch("data/UTA/UTA_Routes.geojson");
    const data = await res.json();

    facilityLayers.bus_route.clearLayers();
    facilityLayers.rail_route.clearLayers();

    L.geoJSON(data, {
      style: f => ({
        color: normalizeRouteMode(f.properties.routetype) === "bus"
          ? "#2563eb"
          : "#7c3aed",
        weight: 2,
        opacity: 0.6
      }),
      onEachFeature: (f, layer) => {
        const mode = normalizeRouteMode(f.properties.routetype);
        if (!mode) return;

        layer.bindPopup(
          `${f.properties.route_name}<br><small>${f.properties.routetype}</small>`
        );

        if (mode === "bus") layer.addTo(facilityLayers.bus_route);
        if (mode === "rail") layer.addTo(facilityLayers.rail_route);
      }
    });
  }

  /* =========================
     Samples
  ========================= */
  let SAMPLE = [];

  async function loadSamples() {
    const res = await fetch("data/samples/samples.json");
    const json = await res.json();
    SAMPLE = json.samples || [];
  }

  function drawSampleOnMap(sample) {
    layers.tripRoute.clearLayers();
    layers.accessEgress.clearLayers();

    if (sample.geometry?.coordinates) {
      const coords = sample.geometry.coordinates.map(c => [c[1], c[0]]);
      const line = L.polyline(coords, {
        color: "#0A2A66",
        weight: 4,
        opacity: 0.85
      });
      layers.tripRoute.addLayer(line);
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
    }

    if (sample.origin) {
      layers.accessEgress.addLayer(
        L.circleMarker(
          [sample.origin.lat, sample.origin.lng],
          { radius: 7, color: "#16a34a", fillOpacity: 0.9 }
        ).bindTooltip("Origin")
      );
    }

    if (sample.destination) {
      layers.accessEgress.addLayer(
        L.circleMarker(
          [sample.destination.lat, sample.destination.lng],
          { radius: 7, color: "#dc2626", fillOpacity: 0.9 }
        ).bindTooltip("Destination")
      );
    }
  }

  function renderSampleList() {
    const list = document.getElementById("sampleList");
    list.innerHTML = "";

    SAMPLE.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "sample-item";
      el.textContent = `Sample ${i + 1}: ${s.trip_id}`;
      el.onclick = () => {
        document.querySelectorAll(".sample-item")
          .forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        drawSampleOnMap(s);
      };
      list.appendChild(el);
    });
  }

  /* =========================
     Facility checkbox binding（关键修复）
  ========================= */
  function bindFacilityCheckboxes() {
    document
      .querySelectorAll('input[type="checkbox"][data-layer]')
      .forEach(cb => {
        const layer = facilityLayers[cb.dataset.layer];
        if (!layer) return;

        if (cb.checked) map.addLayer(layer);

        cb.addEventListener("change", () => {
          if (cb.checked) map.addLayer(layer);
          else map.removeLayer(layer);
        });
      });
  }

  /* =========================
     Init
  ========================= */
  async function init() {
    await loadSamples();
    await loadStops();
    await loadRoutes();

    bindFacilityCheckboxes();        // 🔥 必须在 load 后
    renderSampleList();

    if (SAMPLE.length > 0) {
      drawSampleOnMap(SAMPLE[0]);
    }

    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.onclick = () => switchBasemap(btn.dataset.basemap);
    });
  }

  init();

})();