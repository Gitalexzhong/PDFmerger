## Local PDF and Image Merger

Browser-only tool to merge PDFs and images into one downloadable PDF.

## Features

- Drag and drop **PDF + image files** (`jpg`, `jpeg`, `png`, `webp`, `gif`, etc.).
- Reorder files with smooth pointer-drag sortable behavior.
- Rotate image files (90-degree steps) before export.
- Live merged preview in-browser.
- Rename output file before download.
- Light/dark mode toggle.
- Info modal with quick **Share Link** button.

All processing happens locally in your browser; no file uploads.

## Run locally

- Open `index.html` directly, or:
- `npm install`
- `npm run start`
- Visit `http://localhost:3000` (or the URL printed by `serve`).

## Deploy to Vercel

Because this is a static app, Vercel deployment is straightforward:

1. Install CLI (if needed): `npm i -g vercel`
2. In this folder run: `vercel`
3. Follow prompts (project name + team/account).
4. For production deploy run: `vercel --prod`

## GitHub upload (manual)

If this folder is not already a git repo:

1. `git init`
2. `git add .`
3. `git commit -m "Initial PDF/image merger app"`
4. Create empty GitHub repo
5. `git remote add origin <your-repo-url>`
6. `git push -u origin main`

