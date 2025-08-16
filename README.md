# Loyalty Card Designer

A zero-install, browser-only tool to design wallet-size loyalty cards and export print-ready PDFs with crop marks. Uses CSV (Name, Phone) and supports Code 128 barcodes or QR codes.

## Features

- Drag / resize / rotate; grid with snap & center lines
- Barcode (Code 128) or QR + human-readable text (link/unlink)
- Logo upload (file picker)
- Undo/Redo, delete, template save/load (JSON)
- PDF export (10 cards/page, US Letter) with crop marks

## Use

1. Open `index.html` in any modern browser.
2. Optionally load a template JSON.
3. Load `sample.csv` (or your own). The first row is headers: `Name,Phone`.
4. Upload your logo (PNG/SVG/JPG).
5. Position elements, set background/borders.
6. Export PDF.

## Provenance

This project is **almost 100% AI-generated** and iteratively refined with human feedback.
While it’s been tested to work for typical cases, use your own judgment for production runs.
Pull requests and human reviews are welcome.

## GitHub Pages

1. Create a new repo and push these files.
2. In **Settings → Pages**, set **Source** to `main`, **Branch**: `/root`.
3. Visit `https://<your-username>.github.io/<repo>/`.

## Templates

- A template captures everything: elements, positions, styles, grid/snap, etc.
- Share templates (`.json`) with others so the same layout is reproducible.

## License

This project is released under **The Unlicense** (public domain). See `LICENSE`.

## Third-party

This project uses:

- **JsBarcode** (MIT)
- **qrcode** (MIT)
- **jsPDF** (MIT)

See `THIRD_PARTY_LICENSES.txt` for notices.
