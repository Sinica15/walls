# Walls

A static gallery of photos with locations and collections, published on GitHub Pages
from [`docs/`](docs), plus a local admin app for adding and managing content.

## Public site

Served straight from `docs/` — no build step. Just edit `docs/data/photos.json` /
`docs/data/collections.json` and the webp files under `docs/photos/`, then push to `main`.

## Contributing via the admin app

The admin app runs locally, edits the files under `docs/`, and publishes by committing
and pushing to `main` (which GitHub Pages picks up automatically).

```bash
cd admin
npm install
npm start
```

Open http://127.0.0.1:4173. From there you can:
- Add a new photo (converted to webp automatically) and set its location on a map
- Edit a photo's description, location, or collection membership, or delete it
- Create, rename, or delete collections
- Click **Publish to GitHub Pages** to commit and push your changes

## Data model

- `docs/data/photos.json` — one entry per photo: id, thumb/full webp paths, lat/lon,
  description, createdAt, and the list of collection ids it belongs to.
- `docs/data/collections.json` — one entry per collection: id, name, createdAt, and the
  list of photo ids in it (source of truth for membership).

## Migrating from the old dump (one-time, already run)

`scripts/migrate.js` reads a raw DynamoDB export + downloaded S3 photos (not checked
into this repo — see `.gitignore`) and generates the anonymized `docs/data/*.json` and
`docs/photos/**/*.webp` files. Only needed again if re-importing from a fresh dump.
