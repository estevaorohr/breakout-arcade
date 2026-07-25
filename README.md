# Credit Card Bill Analyzer

A dedicated web app for uploading a PDF credit-card bill and extracting cost entries into a sortable table.

## Entry page
Open [credit-card-bill-analyzer.html](credit-card-bill-analyzer.html) to use the app.

## Features
- Upload a PDF statement
- Extract likely cost entries from the bill
- Show them in a sortable table by cost or date
- Classify each entry into a category

## Breakout Arcade (PC + Android)

The Breakout game can be published as a static site with no monthly hosting cost using GitHub Pages.

### Local run

1. Install Node.js 18+
2. Run `npm start`
3. Open `http://localhost:8000/breakout.html`

### Publish on GitHub Pages (automatic)

1. Push this folder to a GitHub repository
2. In GitHub: Settings -> Pages
3. Source: GitHub Actions
4. Keep branch name as `main` (or adjust `.github/workflows/deploy-pages.yml`)
5. Push any new commit to trigger deploy automatically
6. Open your Pages URL and access `/breakout.html`

This repo already includes a deploy workflow:

- `.github/workflows/deploy-pages.yml`

### Notes

- Works on PC browsers and Android browsers.
- Includes PWA files (`manifest.webmanifest` + `sw.js`) so users can install it on Android home screen.
- Top 20 uses `localStorage`, so rankings are local per browser/device.
