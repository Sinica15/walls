(function () {
  let photos = [];
  let collections = [];

  async function refreshData() {
    [photos, collections] = await Promise.all([
      fetch("/api/photos").then((r) => r.json()),
      fetch("/api/collections").then((r) => r.json()),
    ]);
  }

  // ---------- tabs ----------
  const tabBtns = document.querySelectorAll(".tab-btn");
  const views = document.querySelectorAll(".view");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      if (btn.dataset.view === "add" && !addMap) initAddMap();
      if (btn.dataset.view === "collections") renderCollectionsList();
    });
  });

  function docPath(p) {
    return `/docs/${p}`;
  }

  // ---------- photos grid ----------
  const photosGrid = document.getElementById("photos-grid");
  function renderPhotosGrid() {
    photosGrid.innerHTML = "";
    for (const p of photos) {
      const card = document.createElement("div");
      card.className = "card";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = docPath(p.thumb);
      card.appendChild(img);
      card.addEventListener("click", () => openEditModal(p.id));
      photosGrid.appendChild(card);
    }
  }

  // ---------- collections checkbox helper ----------
  function renderCheckboxList(container, selectedIds) {
    container.innerHTML = "";
    for (const c of collections) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = c.id;
      checkbox.checked = selectedIds.includes(c.id);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(c.name));
      container.appendChild(label);
    }
  }
  function getCheckedIds(container) {
    return Array.from(container.querySelectorAll("input:checked")).map((i) => i.value);
  }

  // ---------- add photo ----------
  let addMap, addMarker;
  const addLat = document.getElementById("add-lat");
  const addLon = document.getElementById("add-lon");

  function initAddMap() {
    addMap = L.map("add-map").setView([52.2, 21.0], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(addMap);
    addMap.on("click", (e) => {
      setAddLocation(e.latlng.lat, e.latlng.lng);
    });
  }
  function setAddLocation(lat, lon) {
    addLat.value = lat.toFixed(6);
    addLon.value = lon.toFixed(6);
    if (addMarker) addMap.removeLayer(addMarker);
    addMarker = L.marker([lat, lon]).addTo(addMap);
  }

  document.getElementById("add-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById("add-preview");
    preview.innerHTML = "";
    if (file) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);
    }
  });

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("add-status");
    const file = document.getElementById("add-file").files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("lat", addLat.value);
    fd.append("lon", addLon.value);
    fd.append("description", document.getElementById("add-description").value);
    fd.append("collections", JSON.stringify(getCheckedIds(document.getElementById("add-collections"))));

    status.textContent = "Uploading...";
    const res = await fetch("/api/photos", { method: "POST", body: fd });
    if (!res.ok) {
      status.textContent = "Error: " + (await res.json()).error;
      return;
    }
    status.textContent = "Added.";
    e.target.reset();
    document.getElementById("add-preview").innerHTML = "";
    if (addMarker) { addMap.removeLayer(addMarker); addMarker = null; }
    await refreshData();
    renderPhotosGrid();
    renderCheckboxList(document.getElementById("add-collections"), []);
  });

  // ---------- edit modal ----------
  const editModal = document.getElementById("edit-modal");
  const editImg = document.getElementById("edit-img");
  const editDescription = document.getElementById("edit-description");
  const editLat = document.getElementById("edit-lat");
  const editLon = document.getElementById("edit-lon");
  const editCollections = document.getElementById("edit-collections");
  const editStatus = document.getElementById("edit-status");
  let editMap, editMarker, currentPhotoId;

  function openEditModal(id) {
    const p = photos.find((x) => x.id === id);
    if (!p) return;
    currentPhotoId = id;
    editStatus.textContent = "";
    editImg.src = docPath(p.thumb);
    editDescription.value = p.description || "";
    editLat.value = p.lat;
    editLon.value = p.lon;
    renderCheckboxList(editCollections, p.collections || []);
    editModal.hidden = false;

    setTimeout(() => {
      if (!editMap) {
        editMap = L.map("edit-map");
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(editMap);
        editMap.on("click", (e) => {
          editLat.value = e.latlng.lat.toFixed(6);
          editLon.value = e.latlng.lng.toFixed(6);
          if (editMarker) editMap.removeLayer(editMarker);
          editMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(editMap);
        });
      }
      editMap.setView([p.lat, p.lon], 13);
      editMap.invalidateSize();
      if (editMarker) editMap.removeLayer(editMarker);
      editMarker = L.marker([p.lat, p.lon]).addTo(editMap);
    }, 0);
  }

  document.getElementById("edit-close").addEventListener("click", () => { editModal.hidden = true; });

  document.getElementById("edit-save").addEventListener("click", async () => {
    editStatus.textContent = "Saving...";
    const res = await fetch(`/api/photos/${currentPhotoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editDescription.value,
        lat: parseFloat(editLat.value),
        lon: parseFloat(editLon.value),
        collections: getCheckedIds(editCollections),
      }),
    });
    if (!res.ok) {
      editStatus.textContent = "Error: " + (await res.json()).error;
      return;
    }
    editStatus.textContent = "Saved.";
    await refreshData();
    renderPhotosGrid();
  });

  document.getElementById("edit-delete").addEventListener("click", async () => {
    if (!confirm("Delete this photo? This removes it from the repo files.")) return;
    editStatus.textContent = "Deleting...";
    const res = await fetch(`/api/photos/${currentPhotoId}`, { method: "DELETE" });
    if (!res.ok) {
      editStatus.textContent = "Error: " + (await res.json()).error;
      return;
    }
    editModal.hidden = true;
    await refreshData();
    renderPhotosGrid();
  });

  // ---------- collections management ----------
  const collectionsList = document.getElementById("collections-list");
  function renderCollectionsList() {
    collectionsList.innerHTML = "";
    for (const c of collections) {
      const row = document.createElement("div");
      row.className = "collection-row";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = c.name;
      const count = document.createElement("span");
      count.className = "muted";
      count.textContent = `${c.postIds.length} photos`;
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Rename";
      saveBtn.addEventListener("click", async () => {
        await fetch(`/api/collections/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nameInput.value }),
        });
        await refreshData();
        renderCollectionsList();
      });
      const delBtn = document.createElement("button");
      delBtn.className = "danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        if (!confirm(`Delete collection "${c.name}"? Photos stay, just unlinked.`)) return;
        await fetch(`/api/collections/${c.id}`, { method: "DELETE" });
        await refreshData();
        renderCollectionsList();
      });
      row.append(nameInput, count, saveBtn, delBtn);
      collectionsList.appendChild(row);
    }
  }

  document.getElementById("new-collection-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("new-collection-name");
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.value }),
    });
    input.value = "";
    await refreshData();
    renderCollectionsList();
    renderCheckboxList(document.getElementById("add-collections"), []);
  });

  // ---------- publish ----------
  document.getElementById("publish-btn").addEventListener("click", async () => {
    const status = document.getElementById("publish-status");
    const message = document.getElementById("publish-message").value || undefined;
    status.textContent = "Publishing...";
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "publish failed");
      status.textContent = data.published ? "Published ✓" : data.message;
    } catch (e) {
      status.textContent = "Error: " + e.message;
    }
  });

  // ---------- init ----------
  (async function init() {
    await refreshData();
    renderPhotosGrid();
    renderCheckboxList(document.getElementById("add-collections"), []);
  })();
})();
