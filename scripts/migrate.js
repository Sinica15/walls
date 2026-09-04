// One-time migration: dynamodb/MainTableV2.json + s3-photos/ -> docs/data + docs/photos
// Anonymized: no userEmail/userId/cognitoUsername ends up in the output.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW_TABLE = path.join(ROOT, "dynamodb", "MainTableV2.json");
const RAW_PHOTOS_DIR = path.join(ROOT, "s3-photos");
const OUT_DATA_DIR = path.join(ROOT, "docs", "data");
const OUT_THUMB_DIR = path.join(ROOT, "docs", "photos", "thumb");
const OUT_FULL_DIR = path.join(ROOT, "docs", "photos", "full");

const THUMB_MAX = 800;
const THUMB_QUALITY = 75;
const FULL_MAX = 2000;
const FULL_QUALITY = 82;

function parseS3Url(url) {
  if (!url) return null;
  const m = /^https:\/\/([^.]+)\.s3[^/]*\/(.+)$/.exec(url);
  if (!m) return null;
  return { bucket: m[1], file: m[2] };
}

async function convert(srcPath, destPath, maxDim, quality) {
  await sharp(srcPath)
    .rotate() // respect EXIF orientation
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toFile(destPath);
}

async function main() {
  fs.mkdirSync(OUT_DATA_DIR, { recursive: true });
  fs.mkdirSync(OUT_THUMB_DIR, { recursive: true });
  fs.mkdirSync(OUT_FULL_DIR, { recursive: true });

  const raw = JSON.parse(fs.readFileSync(RAW_TABLE, "utf8"));
  const items = raw.Items ? raw.Items : raw; // support both raw AWS-JSON and already-deserialized array
  const posts = items.filter((it) => it.pk === "POST");
  const collectionsRaw = items.filter((it) => it.pk === "POST_COLLECTION");

  console.log(`Found ${posts.length} posts, ${collectionsRaw.length} collections`);

  const photos = [];
  const errors = [];
  let done = 0;

  for (const post of posts) {
    const id = post.sk;
    const img = post.image || {};
    const preview = parseS3Url(img.preview);
    const original = parseS3Url(img.original);

    if (!preview || !original) {
      errors.push(`post ${id}: missing image.preview/original url`);
      continue;
    }

    const previewSrc = path.join(RAW_PHOTOS_DIR, preview.file);
    const originalSrc = path.join(RAW_PHOTOS_DIR, original.file);

    if (!fs.existsSync(previewSrc) || !fs.existsSync(originalSrc)) {
      errors.push(`post ${id}: local file missing (${preview.file} / ${original.file})`);
      continue;
    }

    const thumbDest = path.join(OUT_THUMB_DIR, `${id}.webp`);
    const fullDest = path.join(OUT_FULL_DIR, `${id}.webp`);

    try {
      await convert(previewSrc, thumbDest, THUMB_MAX, THUMB_QUALITY);
      await convert(originalSrc, fullDest, FULL_MAX, FULL_QUALITY);
    } catch (e) {
      errors.push(`post ${id}: conversion failed: ${e.message}`);
      continue;
    }

    photos.push({
      id,
      thumb: `photos/thumb/${id}.webp`,
      full: `photos/full/${id}.webp`,
      lat: post.latitude,
      lon: post.longitude,
      description: post.description || "",
      createdAt: post.createdAt,
      collections: [], // filled below
    });

    done += 1;
    if (done % 100 === 0) console.log(`  converted ${done}/${posts.length}...`);
  }

  const photoIndex = new Map(photos.map((p) => [p.id, p]));

  const collections = collectionsRaw.map((c) => ({
    id: c.sk,
    name: c.description || "Untitled",
    createdAt: c.createdAt,
    postIds: (c.postIds || []).filter((pid) => photoIndex.has(pid)),
  }));

  for (const col of collections) {
    for (const pid of col.postIds) {
      photoIndex.get(pid).collections.push(col.id);
    }
  }

  fs.writeFileSync(path.join(OUT_DATA_DIR, "photos.json"), JSON.stringify(photos, null, 2));
  fs.writeFileSync(path.join(OUT_DATA_DIR, "collections.json"), JSON.stringify(collections, null, 2));

  console.log(`\nDone. Wrote ${photos.length} photos, ${collections.length} collections.`);
  if (errors.length) {
    console.log(`\n${errors.length} errors:`);
    for (const e of errors) console.log("  - " + e);
  } else {
    console.log("No errors.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
