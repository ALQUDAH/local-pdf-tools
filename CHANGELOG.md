# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Office conversions now run in the browser:** PDF ↔ Word, PDF ↔ PowerPoint, PDF ↔ Excel and HTML → PDF work on the static site and offline, with no server. 38 of 40 tools are now fully client-side; only AI translation and converting a web page by URL use the server.
- **Tool chaining:** after a tool saves a PDF, a "Continue with…" bar offers 24 tools that can take it next (e.g. Merge → Compress → Protect). The file is passed in memory, with no download/upload round trip.
- Browser tests for every conversion and for tool chaining (36 tests in total).

### Changed
- The server now runs on Express 5.

### Fixed
- **PDF to PDF/A was misleading:** it only renamed the document title to "(ISO PDF/A Compliant)". It now embeds PDF/A-2b identification and matching XMP metadata, an sRGB output intent (color profile generated in code) and a file ID, in both the browser and the server API. The tool explains that full conformance also needs embedded fonts.
- Converter descriptions no longer promise layout or formatting that the text-based conversions don't keep, and Translate no longer claims to keep fonts and layout.
- Office conversions no longer fail on text the built-in PDF fonts can't draw; characters are replaced and the user is told.
- Converter screens (titles, descriptions, upload labels) are now translated to Arabic.

## [1.3.0] - 2026-11-09

### Added
- **Desktop app:** Translate PDF now has a setting for your own Gemini API key. It is stored only on your computer (owner-only file in the app's data folder), and the screen explains that translating sends the document's text to Google.

### Changed
- Desktop app home page now says the tools run on your computer, and that all 40 tools (including the Office converters) work offline.
- Updated lucide-react (1.x), motion (14), dotenv (18) and the GitHub Actions artifact upload action.

### Fixed
- `npm install <package>` failed because of the `@types/node` override syntax.

### Security
- The desktop settings endpoint only exists inside the desktop app and only accepts requests from the app itself (127.0.0.1 host check plus a header cross-site requests can't send).

## [1.2.0] - 2026-11-06

### Added
- **Every tool screen is now available in Arabic** (1,000+ strings), with right-to-left layouts. Switching language updates the open tool instantly.
- Lightweight `tr()` translation system with on-demand language catalogs; see the translation guide in CONTRIBUTING.md.
- Browser tests for Arabic tool screens and live language switching.

### Fixed
- Icon-only back buttons in six tools now have accessible labels.
- Protect PDF help text described the old custom format; it now explains standard password protection.

## [1.1.0] - 2026-11-06

### Added
- **Desktop app** for Windows, macOS (Apple Silicon and Intel) and Linux. All 40 tools work offline, including the Office converters. Installers are attached to every GitHub release.
- **Installable web app (PWA):** install it from the browser; browser tools work offline after the first visit.
- **Arabic** translation with right-to-left layout for the dashboard, plus a language switch.
- Self-hostable OCR: the Tesseract engine is now served by the app, and `VITE_TESSDATA_URL` / `VITE_OCR_FONT_URL` let you serve language data and fonts yourself.
- Automated browser tests (Playwright) for 12 tools, checking that browser tools make no external requests.

### Fixed
- **Protect PDF** now creates standard AES-256 password-protected PDFs that open in any PDF reader. Previously it produced a custom `.secured.pdf` file only this app could open.
- **Unlock PDF** now removes passwords from standard encrypted PDFs (old `.secured.pdf` files still open).

### Changed
- Upgraded to Vite 8 and @vitejs/plugin-react 6.

## [1.0.0] - 2026-11-06

First public release of Local PDF Tools: 30+ PDF tools that run entirely in your browser. Your files never leave your device.

### Added
- 40 PDF tools, 31 of which run entirely in the browser.
- Static build mode (`npm run build:client`) and a GitHub Pages deployment workflow.
- Dockerfile and docker-compose for self-hosting.
- Notice in server-backed tools when no server is available (static hosting).
- SEO and social-preview metadata, favicon.

### Fixed
- `npm start` crashed in production because of `import.meta` in a CommonJS bundle.
- PDF → Word / PowerPoint / Excel and Translate failed (`pdf is not a function`) after the pdf-parse v2 upgrade.
- Non-ASCII uploaded file names could crash the server when setting download headers.

### Security
- HTML → PDF now blocks URLs that resolve to private or local networks (SSRF protection).
- PDF.js worker is bundled locally instead of loaded from a CDN.

### Changed
- Updated GitHub Actions and dependencies (React 19.3, Tailwind 4.3, esbuild 0.28, docx, mammoth, Gemini SDK).
- Every tool is code-split and lazy-loaded; initial JavaScript reduced from ~1.9 MB to ~390 KB.
