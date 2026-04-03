## Local PDF Merger

A small web app to merge PDF files locally in your browser.

- **Drag & drop** PDFs onto the page or use the browse button.
- **Reorder files** via drag and drop to control the final PDF order.
- **Merge in the browser** using `pdf-lib` – no servers, no uploads.
- **Download and rename** the merged PDF before saving.

### Running it

- **Simplest**: open `index.html` directly in a modern browser (Chrome, Edge, Firefox).
- **With a tiny local server** (optional, nicer dev workflow):
  - Run `npm install` (optional, mainly to pin `pdf-lib`).
  - Run `npm run start` and open the shown URL.

Everything runs client‑side; your PDFs never leave your machine.

