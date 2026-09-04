import express from "express";
import multer from "multer";
import sharp from "sharp";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const DATA_DIR = path.join(DOCS_DIR, "data");
const THUMB_DIR = path.join(DOCS_DIR, "photos", "thumb");
const FULL_DIR = path.join(DOCS_DIR, "photos", "full");
const PHOTOS_JSON = path.join(DATA_DIR, "photos.json");
const COLLECTIONS_JSON = path.join(DATA_DIR, "collections.json");

const THUMB_MAX = 800;
const THUMB_QUALITY = 75;
const FULL_MAX = 2000;
const FULL_QUALITY = 82;

const PORT = 4173;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function loadPhotos() { return readJson(PHOTOS_JSON); }
function savePhotos(p) { writeJson(PHOTOS_JSON, p); }
function loadCollections() { return readJson(COLLECTIONS_JSON); }
function saveCollections(c) { writeJson(COLLECTIONS_JSON, c); }

function git(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(import.meta.dirname, "public")));
// serve the current docs/ tree read-only so the admin UI can preview real thumbs/fulls
app.use("/docs", express.static(DOCS_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ---------- photos ----------

app.get("/api/photos", (req, res) => {
  res.json(loadPhotos());
});

app.get("/api/collections", (req, res) => {
  res.json(loadCollections());
});

app.post("/api/photos", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const lat = parseFloat(req.body.lat);
    const lon = parseFloat(req.body.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: "lat/lon must be numbers" });
    }
    const description = req.body.description || "";
    let collectionIds = [];
    if (req.body.collections) {
      collectionIds = JSON.parse(req.body.collections);
    }

    const id = crypto.randomUUID();
    const thumbDest = path.join(THUMB_DIR, `${id}.webp`);
    const fullDest = path.join(FULL_DIR, `${id}.webp`);

    await sharp(req.file.buffer).rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY }).toFile(thumbDest);
    await sharp(req.file.buffer).rotate()
      .resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: FULL_QUALITY }).toFile(fullDest);

    const photos = loadPhotos();
    const entry = {
      id,
      thumb: `photos/thumb/${id}.webp`,
      full: `photos/full/${id}.webp`,
      lat,
      lon,
      description,
      createdAt: new Date().toISOString(),
      collections: collectionIds,
    };
    photos.push(entry);
    savePhotos(photos);

    if (collectionIds.length) {
      const collections = loadCollections();
      for (const c of collections) {
        if (collectionIds.includes(c.id) && !c.postIds.includes(id)) c.postIds.push(id);
      }
      saveCollections(collections);
    }

    res.status(201).json(entry);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/photos/:id", (req, res) => {
  const photos = loadPhotos();
  const photo = photos.find((p) => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: "not found" });

  const { lat, lon, description, collections: newCollectionIds } = req.body;
  if (lat !== undefined) photo.lat = parseFloat(lat);
  if (lon !== undefined) photo.lon = parseFloat(lon);
  if (description !== undefined) photo.description = description;

  if (Array.isArray(newCollectionIds)) {
    const collections = loadCollections();
    const before = new Set(photo.collections);
    const after = new Set(newCollectionIds);
    for (const c of collections) {
      const wasIn = before.has(c.id);
      const isIn = after.has(c.id);
      if (wasIn && !isIn) c.postIds = c.postIds.filter((pid) => pid !== photo.id);
      if (!wasIn && isIn && !c.postIds.includes(photo.id)) c.postIds.push(photo.id);
    }
    saveCollections(collections);
    photo.collections = newCollectionIds;
  }

  savePhotos(photos);
  res.json(photo);
});

app.delete("/api/photos/:id", (req, res) => {
  const id = req.params.id;
  let photos = loadPhotos();
  const photo = photos.find((p) => p.id === id);
  if (!photo) return res.status(404).json({ error: "not found" });

  photos = photos.filter((p) => p.id !== id);
  savePhotos(photos);

  const collections = loadCollections();
  for (const c of collections) {
    c.postIds = c.postIds.filter((pid) => pid !== id);
  }
  saveCollections(collections);

  const thumbPath = path.join(DOCS_DIR, photo.thumb);
  const fullPath = path.join(DOCS_DIR, photo.full);
  for (const f of [thumbPath, fullPath]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  res.json({ ok: true });
});

// ---------- collections ----------

app.post("/api/collections", (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  const collections = loadCollections();
  const entry = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), postIds: [] };
  collections.push(entry);
  saveCollections(collections);
  res.status(201).json(entry);
});

app.patch("/api/collections/:id", (req, res) => {
  const collections = loadCollections();
  const col = collections.find((c) => c.id === req.params.id);
  if (!col) return res.status(404).json({ error: "not found" });
  if (req.body.name !== undefined) col.name = req.body.name.trim();
  saveCollections(collections);
  res.json(col);
});

app.delete("/api/collections/:id", (req, res) => {
  const id = req.params.id;
  let collections = loadCollections();
  if (!collections.find((c) => c.id === id)) return res.status(404).json({ error: "not found" });
  collections = collections.filter((c) => c.id !== id);
  saveCollections(collections);

  const photos = loadPhotos();
  for (const p of photos) {
    p.collections = p.collections.filter((cid) => cid !== id);
  }
  savePhotos(photos);

  res.json({ ok: true });
});

// ---------- publish ----------

app.post("/api/publish", async (req, res) => {
  try {
    const status = await git(["status", "--porcelain", "--", "docs"]);
    if (!status.stdout.trim()) {
      return res.json({ ok: true, published: false, message: "Nothing to publish" });
    }
    await git(["add", "docs"]);
    const message = (req.body && req.body.message) || "Update via admin app";
    await git(["commit", "-m", message]);
    await git(["push", "origin", "main"]);
    res.json({ ok: true, published: true, message });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.stderr || e.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Walls admin running at http://127.0.0.1:${PORT}`);
});
