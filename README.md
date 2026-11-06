# Local PDF Tools

A private, client-side equivalent to iLovePDF that runs PDF manipulation entirely in your browser using WebAssembly and JavaScript engines.

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-teal.svg)

---

## Highlights

- **100% Client-Side Privacy**: PDF files are loaded into browser memory (`ArrayBuffer`) and processed locally. Documents are never transmitted to external servers for local operations.
- **Over 40 PDF Utilities**: Merge, Split, Crop, Compress, OCR, Watermark, Sign, Protect, Edit, Flatten, Bates Numbering, and more.
- **Fast Search & Filter**: Quickly find any utility by name, keyword, or description with instant keyboard shortcuts (`/` or `⌘K`).
- **Dark Mode & Pinned Tools**: Pin favorite tools for quick access and switch between Light, Dark, and System themes.

---

## Utilities Included

| Category | Utilities |
|---|---|
| **Organize** | Merge, Split, Organize Pages, N-Up Print Layout, Resize Pages, Add Margins, Visual Cropper & Margin Trim, Rotate |
| **Edit & Modify** | Add Page Numbers, Bates Numbering & Legal Stamp, Interactive Form Builder, Form Filler, Flatten PDF, In-Browser PDF Editor |
| **Convert & Optimize** | PDF to Images, Images to PDF, Compress PDF, Batch Converter, Text & Markdown Extractor, Grayscale & Monochrome, PDF/A |
| **Analysis & OCR** | Optical Character Scanning (Tesseract OCR), Camera Document Scanner, Visual Diff & Comparison, Metadata Editor, PDF Translate |
| **Security & Legal** | Protect (Encrypt), Unlock PDF, Permanent Redaction, Digital & Handwritten Signatures, Watermarks, Template Overlay, PDF Repair |
| **Office Formats** | PDF to Word / PowerPoint / Excel, Word / PowerPoint / Excel to PDF, HTML to PDF |

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React, DnD Kit
- **PDF Engines**: `pdf-lib`, `pdfjs-dist`
- **OCR Engine**: `tesseract.js`
- **Office Conversion**: `docx`, `exceljs`, `pptxgenjs`, `mammoth`, `pdf-parse`
- **Backend / Dev Server**: Express, Vite, TSX, esbuild

---

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or bun

### Installation

```bash
git clone https://github.com/alqudah/local-pdf-tools.git
cd local-pdf-tools
npm install
```

### Development

Start the development server with Hot Module Reloading:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

---

## License

Apache-2.0
