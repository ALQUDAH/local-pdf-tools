<div align="center">

<img src="public/favicon.svg" width="88" height="88" alt="Local PDF Tools logo" />

# Local PDF Tools

**30+ PDF tools that run entirely in your browser. Your files never leave your device.**

Merge, split, compress, OCR, sign, redact, edit, watermark and more. Free, open source, no sign-up, no uploads, no watermarks, no limits.

[**Try it live →**](https://alqudah.github.io/local-pdf-tools/) &nbsp;·&nbsp; [Self-host](#-self-hosting) &nbsp;·&nbsp; [Report a bug](https://github.com/alqudah/local-pdf-tools/issues/new/choose) &nbsp;·&nbsp; [Request a tool](https://github.com/alqudah/local-pdf-tools/issues/new?template=feature_request.yml)

[![CI](https://github.com/alqudah/local-pdf-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/alqudah/local-pdf-tools/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/alqudah/local-pdf-tools?style=social)](https://github.com/alqudah/local-pdf-tools/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<img src="docs/screenshot-dark.png" alt="Local PDF Tools dashboard" width="900" />

</div>

---

## Why?

Most "free" online PDF tools make you **upload your documents to someone else's server**: contracts, IDs, bank statements, medical records. Then they add watermarks, daily limits, or a paywall.

Local PDF Tools does the work **inside your browser** with WebAssembly and JavaScript. The PDF is read into memory, processed on your own CPU, and saved straight back to your disk. There's nothing to upload and nothing to trust.

- 🔒 **Private by design.** Your documents never leave your device, so it's safe for sensitive and confidential files.
- ⚡ **Fast.** No upload or download wait. Big files are limited only by your machine.
- 💸 **Free forever.** No accounts, no ads, no watermarks, no "3 tasks per day" limits.
- 🧰 **30+ tools in one place**, with instant search (`/` or `⌘K`), pinned favorites and dark mode.
- 🏠 **Self-hostable.** Run it on your laptop, your intranet, or as a static site on any CDN.

> **Don't trust us, verify it:** open DevTools → Network, then run any browser tool. You won't see your file go anywhere.

## Features

| Category | Tools |
|---|---|
| **Organize** | Merge · Split · Organize / reorder pages · Rotate · Crop & trim margins · Resize pages (A4/Letter/Legal) · Add margins · N-up print layout |
| **Edit** | In-browser PDF editor · Add page numbers · Bates numbering & legal stamps · Form builder · Form filler · Flatten forms & annotations |
| **Convert & optimize** | Compress · PDF → images · Images → PDF · Batch converter · Text & Markdown extractor · Grayscale / monochrome |
| **Scan & analyze** | OCR (18 languages incl. Arabic, Chinese, Japanese; searchable PDF output) · Camera document scanner · Visual diff / compare two PDFs · Metadata editor |
| **Security** | Password-protect · Unlock · Permanent redaction · Signatures (draw, type, upload) · Watermarks · Template overlay · Repair corrupted PDFs |
| **Office & web** *(self-hosted server only)* | PDF ↔ Word · PDF ↔ PowerPoint · PDF ↔ Excel · HTML/URL → PDF · PDF/A · AI translation |

### Privacy model: what runs where

| | Where it runs | Notes |
|---|---|---|
| **Browser tools** (31 of 40) | 100% in your browser | Files are never transmitted. Works on the static demo. |
| **Office / HTML / PDF/A / Translate** (9 of 40) | On the Node.js server **you** run | Clearly labeled "Self-Hosted Server Tool". On the static demo they're disabled and nothing is sent. Translate calls Google Gemini only if you configure an API key. |

A few browser tools download open-source **assets** (never your documents) the first time you use them: Tesseract OCR language models and the OCR engine, plus handwriting-style signature fonts. These come from public CDNs (jsDelivr, Google Fonts) and are cached by your browser.

## Quick start

### Use it online

👉 **<https://alqudah.github.io/local-pdf-tools/>**

### Run locally

Requires **Node.js 20+**.

```bash
git clone https://github.com/alqudah/local-pdf-tools.git
cd local-pdf-tools
npm install
npm run dev
```

Open <http://localhost:3000>. All 40 tools are available, including the server-backed Office converters.

## 🏠 Self-hosting

### Option 1: Docker (full app, all 40 tools)

```bash
docker build -t local-pdf-tools .
docker run -p 3000:3000 local-pdf-tools
```

Or with Docker Compose:

```bash
docker compose up -d
```

### Option 2: Node.js (full app)

```bash
npm ci
npm run build
npm start
```

### Option 3: Static hosting (browser tools only)

Build a plain static site and upload `dist/` anywhere: GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3, nginx.

```bash
npm ci
npm run build:client
```

When serving from a sub-path (e.g. `https://you.github.io/local-pdf-tools/`), set `BASE_PATH`:

```bash
BASE_PATH=/local-pdf-tools/ npm run build:client
```

This repo ships a [GitHub Pages workflow](.github/workflows/deploy-pages.yml). To use it on your fork, go to **Settings → Pages → Source: GitHub Actions**.

### Configuration

All optional, and only used by the Node server. See [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Interface to bind |
| `GEMINI_API_KEY` | (none) | Enables the AI **Translate PDF** tool |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model used for translation |

## Tech stack

- **UI:** React 19, TypeScript, Tailwind CSS v4, Lucide icons, dnd-kit, Motion
- **PDF engines:** [pdf-lib](https://github.com/Hopding/pdf-lib) (write/modify), [PDF.js](https://github.com/mozilla/pdf.js) (render/parse, worker bundled locally)
- **OCR:** [Tesseract.js](https://github.com/naptha/tesseract.js)
- **Optional server:** Express, `docx`, `exceljs`, `pptxgenjs`, `mammoth`, `pdf-parse`
- **Build:** Vite, esbuild

## Project structure

```
src/
  App.tsx              # Dashboard, search, tool registry & routing
  components/*Tool.tsx # One lazily loaded component per tool
  lib/pdfUtils.ts      # Shared PDF helpers (pdf-lib + PDF.js)
  lib/pdfjs.ts         # PDF.js worker setup (bundled, no CDN)
server.ts              # Optional Express server for Office/HTML/translate tools
```

## Roadmap

- [ ] Installable PWA with full offline support
- [ ] Move Office conversions into the browser (WASM) so all tools work without a server
- [ ] Internationalization (Arabic / RTL first)
- [ ] Drag-and-drop tool chaining ("workflows")
- [ ] Automated browser tests for every tool

Have an idea? [Open a feature request](https://github.com/alqudah/local-pdf-tools/issues/new?template=feature_request.yml).

## Contributing

Contributions of every size are welcome: bug reports, new tools, translations, docs. Read the [contributing guide](CONTRIBUTING.md) to get started. Issues labeled [`good first issue`](https://github.com/alqudah/local-pdf-tools/labels/good%20first%20issue) are a great entry point.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md). Found a security issue? See [SECURITY.md](SECURITY.md).

## Support the project

If Local PDF Tools saved you from uploading a sensitive document somewhere, **[give it a ⭐ on GitHub](https://github.com/alqudah/local-pdf-tools)**. It helps others find it.

## License

[Apache-2.0](LICENSE). Free for personal and commercial use.
