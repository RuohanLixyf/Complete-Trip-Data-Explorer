/* global L, SAMPLE */

(function () {

  /* =========================
     Map init
  ========================= */
  const map = L.map("map", { zoomControl: true })
    .setView([40.758, -111.89], 12);

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

  // 默认底图
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
    od: L.layerGroup().addTo(map),
    tripRoute: L.layerGroup().addTo(map),
    accessEgress: L.layerGroup().addTo(map),
    tdi: L.geoJSON(null).addTo(map)
  };

  const facilityLayers = {
    bus_stop: L.layerGroup().addTo(map),
    rail_stop: L.layerGroup().addTo(map),
    bus_route: L.layerGroup().addTo(map),
    rail_route: L.layerGroup().addTo(map)
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

        const layer = L.circleMarker(latlng, {
          radius: 4,
          color: mode === "bus" ? "#2563eb" : "#7c3aed",
          weight: 1,
          fillOpacity: 0.9
        });

        layer.bindPopup(
          `${f.properties.stop_name}<br><small>${f.properties.mode}</small>`
        );

        if (mode === "bus") layer.addTo(facilityLayers.bus_stop);
        if (mode === "rail") layer.addTo(facilityLayers.rail_stop);

        return layer;
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

  function renderSampleList() {
    const list = document.getElementById("sampleList");
    if (!list) return;

    list.innerHTML = "";

    if (!SAMPLE.length) {
      list.innerHTML = `<div class="small">No samples loaded.</div>`;
      return;
    }

    SAMPLE.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "sample-item";
      el.textContent = `Sample ${i + 1}: ${s.trip_id}`;
      el.addEventListener("click", () => {
        document
          .querySelectorAll(".sample-item")
          .forEach(x => x.classList.remove("active"));
        el.classList.add("active");
      
        drawSampleOnMap(s);
      });
      list.appendChild(el);
    });
  }

  function attachViewPillEvents() {
    const pills = document.querySelectorAll(".view-pill");
    const samplePanel = document.getElementById("samples-panel");

    if (!samplePanel) return;

    pills.forEach(pill => {
      pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");

        const view = pill.dataset.view;

        if (view === "samples") {
          samplePanel.style.display = "block";
          renderSampleList();
        } else {
          samplePanel.style.display = "none";
        }
      });
    });
  }
  function drawSampleOnMap(sample) {
    // 清空旧图层
    layers.tripRoute.clearLayers();
    layers.accessEgress.clearLayers();
  
    // 1️⃣ 画轨迹（LineString）
    if (sample.geometry && sample.geometry.coordinates) {
      const coords = sample.geometry.coordinates.map(c => [c[1], c[0]]);
      const line = L.polyline(coords, {
        color: "#0A2A66",
        weight: 4,
        opacity: 0.85
      });
      layers.tripRoute.addLayer(line);
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
    }
  
    // 2️⃣ 起点
    if (sample.origin) {
      layers.accessEgress.addLayer(
        L.circleMarker(
          [sample.origin.lat, sample.origin.lng],
          { radius: 7, color: "#16a34a", fillOpacity: 0.9 }
        ).bindTooltip("Origin")
      );
    }
  
    // 3️⃣ 终点
    if (sample.destination) {
      layers.accessEgress.addLayer(
        L.circleMarker(
          [sample.destination.lat, sample.destination.lng],
          { radius: 7, color: "#dc2626", fillOpacity: 0.9 }
        ).bindTooltip("Destination")
      );
    }
  }
  /* =========================
     Checkbox → layer toggle
  ========================= */
  document
  .querySelectorAll('input[type="checkbox"][data-layer]')
  .forEach(cb => {
    const layer = facilityLayers[cb.dataset.layer];
    if (!layer) return;

    // 🔹 初始同步
    if (cb.checked) map.addLayer(layer);
    else map.removeLayer(layer);

    // 🔥 监听变化
    cb.addEventListener("change", () => {
      if (cb.checked) map.addLayer(layer);
      else map.removeLayer(layer);
    });
  });

  /* =========================
     Init
  ========================= */
  async function init() {
    await loadSamples();
    await loadStops();
    await loadRoutes();


    attachViewPillEvents();
    renderSampleList();   // ✅ 默认显示一次
    if (SAMPLE.length > 0) {
      drawSampleOnMap(SAMPLE[0]);
    }
    document.querySelectorAll(".bm-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        switchBasemap(btn.dataset.basemap);
      });
    });
  }

  init();

})();