(async function () {
  const [photos, collections] = await Promise.all([
    fetch("data/photos.json").then((r) => r.json()),
    fetch("data/collections.json").then((r) => r.json()),
  ]);

  photos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const photoById = new Map(photos.map((p) => [p.id, p]));
  const collectionById = new Map(collections.map((c) => [c.id, c]));

  // ---------- secret locations flag ----------
  // Map view is hidden by default. To reveal it, run in the browser console:
  //   localStorage.setItem("walls:showLocations", "true")
  // then reload the page.
  const LOCATIONS_FLAG_KEY = "walls:showLocations";
  if (localStorage.getItem(LOCATIONS_FLAG_KEY) === null) {
    localStorage.setItem(LOCATIONS_FLAG_KEY, "false");
  }
  const locationsEnabled = localStorage.getItem(LOCATIONS_FLAG_KEY) === "true";
  const mapTabBtn = document.querySelector('.tab-btn[data-view="map"]');
  if (!locationsEnabled && mapTabBtn) {
    mapTabBtn.style.display = "none";
  }

  // ---------- tabs ----------
  const tabBtns = document.querySelectorAll(".tab-btn");
  const views = document.querySelectorAll(".view");
  let mapInitialized = false;

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      if (btn.dataset.view === "map" && !mapInitialized) {
        initMap();
        mapInitialized = true;
      }
    });
  });

  // ---------- gallery ----------
  const galleryGrid = document.getElementById("gallery-grid");
  const filterBar = document.getElementById("gallery-filter");
  const filterLabel = document.getElementById("gallery-filter-label");
  const filterClear = document.getElementById("gallery-filter-clear");

  function renderGallery(list) {
    galleryGrid.innerHTML = "";
    for (const p of list) {
      const card = document.createElement("div");
      card.className = "card";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = p.thumb;
      img.alt = p.description || "";
      card.appendChild(img);
      card.addEventListener("click", () => openLightbox(p.id));
      galleryGrid.appendChild(card);
    }
  }

  function showGalleryFiltered(collectionId) {
    const col = collectionById.get(collectionId);
    if (!col) return;
    filterBar.hidden = false;
    filterLabel.textContent = `Collection: ${col.name} (${col.postIds.length})`;
    const colPhotos = col.postIds.map((id) => photoById.get(id)).filter(Boolean);
    colPhotos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderGallery(colPhotos);
    tabBtns.forEach((b) => b.classList.remove("active"));
    views.forEach((v) => v.classList.remove("active"));
    document.querySelector('[data-view="gallery"]').classList.add("active");
    document.getElementById("view-gallery").classList.add("active");
  }

  filterClear.addEventListener("click", () => {
    filterBar.hidden = true;
    renderGallery(photos);
  });

  renderGallery(photos);

  // ---------- collections ----------
  const collectionsGrid = document.getElementById("collections-grid");
  for (const c of collections) {
    const cover = photoById.get(c.postIds[0]);
    const card = document.createElement("div");
    card.className = "card";
    if (cover) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = cover.thumb;
      card.appendChild(img);
    }
    const label = document.createElement("div");
    label.className = "col-name";
    label.innerHTML = `${escapeHtml(c.name)} <span class="col-count">(${c.postIds.length})</span>`;
    card.appendChild(label);
    card.addEventListener("click", () => showGalleryFiltered(c.id));
    collectionsGrid.appendChild(card);
  }

  // ---------- map ----------
  function initMap() {
    const map = L.map("map").setView(computeCenter(), 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    const cluster = L.markerClusterGroup();
    for (const p of photos) {
      if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
      const marker = L.marker([p.lat, p.lon]);
      const popupDiv = document.createElement("div");
      const img = document.createElement("img");
      img.src = p.thumb;
      img.addEventListener("click", () => openLightbox(p.id));
      popupDiv.appendChild(img);
      marker.bindPopup(popupDiv);
      cluster.addLayer(marker);
    }
    map.addLayer(cluster);
  }

  function computeCenter() {
    const withCoords = photos.filter((p) => typeof p.lat === "number" && typeof p.lon === "number");
    if (!withCoords.length) return [52.2, 21.0];
    const lat = withCoords.reduce((s, p) => s + p.lat, 0) / withCoords.length;
    const lon = withCoords.reduce((s, p) => s + p.lon, 0) / withCoords.length;
    return [lat, lon];
  }

  // ---------- lightbox ----------
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxDesc = document.getElementById("lightbox-desc");
  const lightboxDate = document.getElementById("lightbox-date");
  const lightboxCollections = document.getElementById("lightbox-collections");
  document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  function openLightbox(photoId) {
    const p = photoById.get(photoId);
    if (!p) return;
    lightboxImg.src = p.full;
    lightboxImg.alt = p.description || "";
    lightboxDesc.textContent = p.description || "";
    lightboxDesc.style.display = p.description ? "" : "none";
    lightboxDate.textContent = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "";
    lightboxCollections.innerHTML = "";
    for (const cid of p.collections) {
      const col = collectionById.get(cid);
      if (!col) continue;
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = col.name;
      chip.addEventListener("click", () => {
        closeLightbox();
        showGalleryFiltered(cid);
      });
      lightboxCollections.appendChild(chip);
    }
    lightbox.hidden = false;
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }
})();
