# Royalty Dashboard (beta)

A dashboard for music royalty exports that runs in your browser. Load your files and it shows:

- **Money**: totals by source and currency, earnings by month, a song rank, APRA AMCOS payouts by statement and by work
- **Market**: countries and stores, for the whole catalogue or one song
- **Song**: one song's earnings over time, markets, stores, codes, APRA works and statement lines
- **Register**: gaps between your files, such as a paid recording with no APRA work, a work with no ISRC, or a sole-writer share under 100%

This is a beta concept.

![Money view with the demo data](screenshots/preview-desktop-money.png)

## Supported files

- DistroKid all-time earnings export (CSV)
- APRA AMCOS royalty statements (XLSX or CSV, Australia and New Zealand), plus the Royalty Source Categories List CSVs
- APRA AMCOS Works List (XLSX or CSV)
- PPCA repertoire (XLSX or CSV)

Add several files at once. Each file's type is detected from its column headers.

Amounts in different currencies (DistroKid USD, APRA and AMCOS AUD and NZD) are shown separately and never added together. Anything missing from your files is left blank.

## Run it

1. Clone or download this repository:
   `git clone https://github.com/maximini22/royalty-dashboard.git`
2. Open `index.html` in a browser. No install or build step.
3. Drop your exports onto the page, or choose **Try with demo data**.

You can also serve the folder from any static web server.

## Demo data

`demo/` holds a demo pack. Every name, title, code and amount in it is fictional.

- `demo/distrokid/`, `demo/apra-amcos/`, `demo/ppca/`: the demo files, in the same formats as the real exports
- `demo/jeremy-legal-demo-pack.zip`: the same pack as one download
- `demo/demo-pack.js`: the same files bundled for the **Try with demo data** button

The demo pack is MIT licensed (`demo/LICENSE`).

## Privacy

Your files are read in your browser and never uploaded. No cookies, no analytics, no outside network requests.

## Licence

MIT. See `LICENSE`.

- SheetJS Community Edition: Apache-2.0, `vendor/LICENSE-SheetJS.txt`
- Papa Parse: MIT, `vendor/LICENSE-PapaParse.txt`

---

By ROBBIE P / Jeremy Legal Records
