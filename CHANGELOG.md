# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
