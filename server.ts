import "dotenv/config";
import express from "express";
import path from "path";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import exceljs from "exceljs";
import pptxgen from "pptxgenjs";
import mammoth from "mammoth";
import JSZip from "jszip";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { preparePdfA } from "./src/lib/pdfa";
import { sanitizeForWinAnsi } from "./src/lib/winAnsi";
import { fetchPublicUrl, BlockedUrlError } from "./server/publicFetch";
import { extractTextBlocks } from "./server/htmlBlocks";

// Initialize express app
const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Local-only by default; Docker sets HOST=0.0.0.0 inside the container
const HOST = process.env.HOST || "127.0.0.1";

// Upper bound for submitted or fetched HTML (characters / bytes)
const MAX_HTML_CHARS = 2 * 1024 * 1024;
// Web pages can be larger than pasted HTML (long articles reach ~3 MB); parsing is linear
const MAX_FETCHED_HTML_BYTES = 10 * 1024 * 1024;
// Upper bound for generated pages, so a huge input can't keep the server busy drawing
const MAX_HTML_PDF_PAGES = 300;

// Header-safe base filename (Content-Disposition only accepts a limited charset)
function safeBaseName(name: string): string {
  return name.replace(/\.\w+$/, "").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
}

// Extract plain text (whole document + per page) from a PDF buffer
async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: string[] }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text || "", pages: result.pages.map((p) => p.text || "") };
  } finally {
    await parser.destroy();
  }
}

// Configure multer file upload
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Configure JSON and text body parsers
// Only the HTML -> PDF route takes JSON/urlencoded bodies; file uploads go through multer
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));

// Helper: Wrap text to page width
function wrapText(text: string, width: number, fontSize: number, font: any): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > width) {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// ----------------------------------------------------
// API ROUTES FOR PDF CONVERSIONS
// ----------------------------------------------------

// 1. PDF to Word
app.post("/api/convert/pdf-to-word", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing uploaded file content" });
    }
    
    // Parse PDF text page-by-page
    const { text } = await extractPdfText(req.file.buffer);
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: lines.map(line => new Paragraph({
          children: [new TextRun({ text: line, size: 24 })]
        }))
      }]
    });
    
    const wordBuffer = await Packer.toBuffer(doc);
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_converted.docx"`);
    res.send(wordBuffer);
  } catch (error: any) {
    console.error("PDF to Word conversion error:", error);
    res.status(500).json({ error: error.message || "Failed to convert PDF to Word document" });
  }
});

// 2. PDF to PowerPoint
app.post("/api/convert/pdf-to-powerpoint", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing uploaded file content" });
    }
    
    // Read PDF page by page
    const { pages: rawPages } = await extractPdfText(req.file.buffer);
    const pages = rawPages.map((p) => p.replace(/\s+/g, " ").trim());
    
    const pptx = new pptxgen();
    
    if (pages.length === 0) {
      const slide = pptx.addSlide();
      slide.addText("No text content found in the PDF source", { x: 1, y: 1, fontSize: 16 });
    } else {
      pages.forEach((pageText, idx) => {
        const slide = pptx.addSlide();
        
        // Header
        slide.addText(`Transformed PDF Page ${idx + 1}`, {
          x: 0.5,
          y: 0.4,
          w: 9,
          h: 0.8,
          fontSize: 22,
          bold: true,
          color: "2D3748"
        });
        
        // Body Content
        slide.addText(pageText.slice(0, 1200) || "Empty slice layout", {
          x: 0.5,
          y: 1.4,
          w: 9,
          h: 5.0,
          fontSize: 14,
          color: "4A5568"
        });
      });
    }
    
    const pptxBuffer = await pptx.write({ outputType: "nodebuffer" }) as Buffer;
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_converted.pptx"`);
    res.send(pptxBuffer);
  } catch (error: any) {
    console.error("PDF to PPTX conversion error:", error);
    res.status(500).json({ error: error.message || "Failed to transform PDF to PowerPoint slides" });
  }
});

// 3. PDF to Excel
app.post("/api/convert/pdf-to-excel", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }
    
    const { text } = await extractPdfText(req.file.buffer);
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet("Converted Data");
    
    lines.forEach((line) => {
      // Split rows based on columns separated by double spacing or tabs
      const cells = line.split(/\s{2,}|\t/);
      worksheet.addRow(cells);
    });
    
    // Style column widths dynamically
    worksheet.columns?.forEach(column => {
      if (column) {
        column.width = 18;
      }
    });
    
    const excelBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_converted.xlsx"`);
    res.send(excelBuffer);
  } catch (error: any) {
    console.error("PDF to Excel error:", error);
    res.status(500).json({ error: error.message || "Failed to convert PDF to Excel spreadsheet" });
  }
});

// 4. Word to PDF
app.post("/api/convert/word-to-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing document file" });
    }
    
    const result = await mammoth.extractRawText({ buffer: req.file.buffer });
    const text = result.value || "";
    
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage([595.27, 841.89]); // A4 Dimension
    const { width, height } = page.getSize();
    const margin = 50;
    const contentWidth = width - (margin * 2);
    let y = height - margin;
    
    // Title
    page.drawText("DOCX Document Content", {
      x: margin,
      y: y,
      size: 16,
      font: fontBold,
      color: rgb(0.12, 0.22, 0.45)
    });
    y -= 35;
    
    const paragraphs = text.split("\n");
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        y -= 12;
        continue;
      }
      
      const lines = wrapText(trimmed, contentWidth, 11, font);
      for (const line of lines) {
        if (y < margin + 20) {
          page = pdfDoc.addPage([595.27, 841.89]);
          y = height - margin;
        }
        
        page.drawText(line, {
          x: margin,
          y: y,
          size: 11,
          font: font,
          color: rgb(0.15, 0.15, 0.15)
        });
        y -= 16;
      }
      y -= 8;
    }
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_converted.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("Word to PDF structure error:", error);
    res.status(500).json({ error: error.message || "Failed to make DOCX into PDF" });
  }
});

// 5. PowerPoint to PDF
app.post("/api/convert/powerpoint-to-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No pptx uploaded" });
    }
    
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const zip = await JSZip.loadAsync(req.file.buffer);
    const slides: { num: number; text: string }[] = [];
    
    for (const filename of Object.keys(zip.files)) {
      if (filename.startsWith("ppt/slides/slide") && filename.endsWith(".xml")) {
        const num = parseInt(filename.match(/\d+/)![0]);
        const content = await zip.files[filename].async("text");
        
        const matches = [...content.matchAll(/<a:t>([^<]*)<\/a:t>/g)];
        const slideText = matches.map(m => m[1]).join(" ").trim();
        slides.push({ num, text: slideText });
      }
    }
    
    slides.sort((a, b) => a.num - b.num);
    
    if (slides.length === 0) {
      const page = pdfDoc.addPage([841.89, 595.27]); // Landscape A4
      page.drawText("No slide contents extracted", { x: 50, y: 300, font, size: 14 });
    } else {
      for (const slide of slides) {
        const page = pdfDoc.addPage([841.89, 595.27]);
        const { width, height } = page.getSize();
        
        // Border background layout
        page.drawRectangle({
          x: 25,
          y: 25,
          width: width - 50,
          height: height - 50,
          borderColor: rgb(0.8, 0.82, 0.85),
          borderWidth: 1,
          color: rgb(0.97, 0.98, 0.99)
        });
        
        page.drawText(`Slide ${slide.num}`, {
          x: 60,
          y: height - 60,
          size: 20,
          font: fontBold,
          color: rgb(0.12, 0.22, 0.45)
        });
        
        const lines = wrapText(slide.text, width - 120, 12, font);
        let y = height - 100;
        for (const line of lines) {
          if (y < 60) break;
          page.drawText(line, {
            x: 60,
            y: y,
            size: 12,
            font: font,
            color: rgb(0.2, 0.2, 0.2)
          });
          y -= 20;
        }
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_converted.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("PPTX to PDF error:", error);
    res.status(500).json({ error: error.message || "Failed to make PowerPoint slides into PDF" });
  }
});

// 6. Excel to PDF
app.post("/api/convert/excel-to-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing XLSX content" });
    }
    
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const workbook = new exceljs.Workbook();
    // exceljs declares its own Buffer type that clashes with @types/node; a Node Buffer works at runtime
    await workbook.xlsx.load(req.file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    
    workbook.worksheets.forEach((sheet) => {
      let page = pdfDoc.addPage([841.89, 595.27]); // Landscape A4 for wide spacing
      const { width, height } = page.getSize();
      let y = height - 55;
      
      page.drawText(sheet.name || "Grid Sheet", {
        x: 35,
        y: y,
        size: 18,
        font: fontBold,
        color: rgb(0.1, 0.45, 0.3)
      });
      y -= 35;
      
      sheet.eachRow((row, rowNumber) => {
        if (y < 45) {
          page = pdfDoc.addPage([841.89, 595.27]);
          y = height - 55;
        }
        
        const values: string[] = [];
        row.eachCell((cell) => {
          values.push(cell.text || String(cell.value || ""));
        });
        
        const rowText = values.join("  |  ");
        page.drawText(rowText.slice(0, 160), {
          x: 35,
          y: y,
          size: 10,
          font: rowNumber === 1 ? fontBold : font,
          color: rgb(0.18, 0.18, 0.18)
        });
        
        page.drawLine({
          start: { x: 35, y: y - 4 },
          end: { x: width - 35, y: y - 4 },
          thickness: 0.6,
          color: rgb(0.85, 0.85, 0.85)
        });
        
        y -= 20;
      });
    });
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_converted.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("Excel to PDF compilation error:", error);
    res.status(500).json({ error: error.message || "Failed to organize Excel grid sheet into PDF" });
  }
});

// 7. HTML to PDF
app.post("/api/convert/html-to-pdf", async (req, res) => {
  try {
    const { htmlInput, urlInput } = req.body;
    let html = typeof htmlInput === "string" ? htmlInput : "";
    if (html.length > MAX_HTML_CHARS) {
      return res.status(413).json({ error: "HTML is too large (limit 2 MB)" });
    }

    if (urlInput) {
      try {
        const page = await fetchPublicUrl(String(urlInput), { maxBytes: MAX_FETCHED_HTML_BYTES });
        html = page.ok ? page.body : `<h1>Request failed with status ${page.status}</h1>`;
      } catch (err: any) {
        if (err instanceof BlockedUrlError) {
          return res.status(400).json({ error: err.message });
        }
        html = `<h1>Network Connection Failed</h1><p>Could not fetch the page.</p>`;
      }
    }

    if (!html.trim()) {
      return res.status(400).json({ error: "Missing HTML text body or Web Address value" });
    }
    
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage([595.27, 841.89]);
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;
    
    // Linear-time HTML tokenizer (no regular expressions over untrusted input)
    const { blocks, plainText } = extractTextBlocks(html);
    const found = blocks.length > 0;

    let truncated = false;
    let replacedCharacters = false;
    const winAnsi = (text: string) => {
      const out = sanitizeForWinAnsi(text);
      if (out !== text) replacedCharacters = true;
      return out;
    };
    const addPage = () => {
      if (pdfDoc.getPageCount() >= MAX_HTML_PDF_PAGES) {
        truncated = true;
        return false;
      }
      page = pdfDoc.addPage([595.27, 841.89]);
      y = height - margin;
      return true;
    };

    for (const { tag, text: rawText } of blocks) {
      if (truncated) break;
      const isHeading = tag === "h1" || tag === "h2";
      const fontSize = isHeading ? (tag === "h1" ? 18 : 14) : 10;
      const currentFont = isHeading ? fontBold : font;
      const color = isHeading ? rgb(0.1, 0.15, 0.35) : rgb(0.2, 0.2, 0.2);

      const lines = wrapText(winAnsi(rawText), width - 100, fontSize, currentFont);

      for (const line of lines) {
        if (y < margin + 25 && !addPage()) break;

        page.drawText(line, {
          x: tag === "li" ? margin + 15 : margin,
          y: y,
          size: fontSize,
          font: currentFont,
          color: color
        });
        y -= (fontSize + 8);
      }
      y -= 12;
    }

    if (!found) {
      // Plain text render
      const textToRender = winAnsi(plainText.slice(0, 1_000_000));
      const lines = wrapText(textToRender, width - 100, 11, font);
      for (const line of lines) {
        if (y < margin + 25 && !addPage()) break;
        page.drawText(line, { x: margin, y: y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
        y -= 16;
      }
    }
    
    if (truncated) {
      page.drawText(`[Output truncated at ${MAX_HTML_PDF_PAGES} pages]`, { x: margin, y: margin, size: 9, font, color: rgb(0.6, 0.1, 0.1) });
    }

    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"web_print_output.pdf\"");
    // Tells the app to show its "some characters were replaced" notice
    if (replacedCharacters) res.setHeader("X-Characters-Replaced", "true");
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("HTML to PDF conversion error:", error);
    res.status(500).json({ error: error.message || "Failed to render website details into PDF format" });
  }
});

// 8. PDF to PDF/A (Archiving standard)
app.post("/api/convert/pdf-to-pdfa", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing source document" });
    }
    // Same implementation as the browser app: PDF/A-2b metadata, sRGB output intent and file ID.
    // Full conformance also requires all fonts to be embedded in the source PDF.
    const pdfBytes = await preparePdfA(new Uint8Array(req.file.buffer), req.file.originalname);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_pdfa.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("PDF/A error:", error);
    res.status(500).json({ error: error.message || "Failed to prepare PDF/A document" });
  }
});

// 9. Translate PDF using Google Gemini (Fully compliant with server-side SDK calls!)
app.post("/api/convert/translate-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing target document" });
    }
    
    const targetLang = String(req.body.targetLang || "Arabic").slice(0, 40);
    
    // Extract text layout
    const { text } = await extractPdfText(req.file.buffer);
    
    if (!text.trim()) {
      return res.status(400).json({ error: "Could not find extractable physical text in PDF to translate" });
    }
    
    let translatedText = "";
    
    if (process.env.GEMINI_API_KEY) {
      // Setup the authentic Gemini Client
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });
      
      const systemInstruction = `You are a high fidelity literal document translator. Map and translate the given document text strictly to the language: ${targetLang}. Keep exact paragraphs, maintain item lists. Do not write any greetings or explanations. Only return the final translated document contents.`;
      
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
        contents: text.slice(0, 8000), // Protect token boundaries safely
        config: {
          systemInstruction
        }
      });
      
      translatedText = response.text || "";
    } else {
      // Mock / Offline Translation fallback if API Key is not configured
      translatedText = `*** OFFLINE TRANSLATION PREVIEW (GEMINI KEY MISSING) ***\n\nTarget Language: ${targetLang}\n\n[Original Content Sample]:\n\n${text.slice(0, 1500)}\n\n(Note: To process high-quality Gemini translation, set the GEMINI_API_KEY environment variable on the server.)`;
    }
    
    // Compile into translated PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let page = pdfDoc.addPage([595.27, 841.89]);
    const { width, height } = page.getSize();
    const margin = 50;
    const contentWidth = width - (margin * 2);
    let y = height - margin;
    
    page.drawText(`Translated Document (${targetLang})`, {
      x: margin,
      y: y,
      size: 15,
      font: fontBold,
      color: rgb(0.12, 0.43, 0.24)
    });
    y -= 30;
    
    const paragraphs = translatedText.split("\n");
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        y -= 12;
        continue;
      }
      
      const lines = wrapText(trimmed, contentWidth, 10, font);
      for (const line of lines) {
        if (y < margin + 25) {
          page = pdfDoc.addPage([595.27, 841.89]);
          y = height - margin;
        }
        
        page.drawText(line, {
          x: margin,
          y: y,
          size: 10,
          font: font,
          color: rgb(0.16, 0.16, 0.16)
        });
        y -= 15;
      }
      y -= 8;
    }
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_translated_${safeBaseName(String(targetLang)).toLowerCase()}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("PDF Translation error:", error);
    res.status(500).json({ error: error.message || "Failed to compile literal document translation" });
  }
});

// A basic health check route
// ----------------------------------------------------
// DESKTOP APP SETTINGS (only when embedded in the Electron app)
// ----------------------------------------------------
const isDesktop = () => !!process.env.LPT_EMBEDDED && !!process.env.LPT_SETTINGS_FILE;

function loadDesktopSettings() {
  if (!isDesktop()) return;
  try {
    const saved = JSON.parse(fs.readFileSync(process.env.LPT_SETTINGS_FILE!, "utf8"));
    if (saved.geminiApiKey && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = saved.geminiApiKey;
  } catch {
    /* no settings yet */
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", keyConfigured: !!process.env.GEMINI_API_KEY, desktop: isDesktop() });
});

// Lets the desktop app store a Gemini API key for "Translate PDF".
// Locked to the app itself: the server only listens on 127.0.0.1, the Host header must match
// (blocks DNS rebinding), and the custom header forces a CORS preflight that other sites can't pass.
app.post("/api/settings/gemini-key", (req, res) => {
  if (!isDesktop()) return res.status(404).json({ error: "Not available" });
  const host = String(req.headers.host || "");
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || req.headers["x-lpt-desktop"] !== "1") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
  if (key.length > 200) return res.status(400).json({ error: "Key is too long" });
  try {
    const file = process.env.LPT_SETTINGS_FILE!;
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      /* new file */
    }
    if (key) settings.geminiApiKey = key;
    else delete settings.geminiApiKey;
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 });
    if (key) process.env.GEMINI_API_KEY = key;
    else delete process.env.GEMINI_API_KEY;
    res.json({ keyConfigured: !!key });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Could not save settings" });
  }
});

// ----------------------------------------------------
// VITE DEV SERVER AND PRODUCTION SERVING MIDDLEWARES
// ----------------------------------------------------

export interface StartOptions {
  port?: number;
  host?: string;
  /** Folder with the built web app (production only). Defaults to ./dist */
  distPath?: string;
}

/** Starts the HTTP server. Resolves with the port it listens on (useful with port 0). */
export async function startServer(options: StartOptions = {}): Promise<{ port: number }> {
  const port = options.port ?? PORT;
  const host = options.host ?? HOST;
  loadDesktopSettings();

  if (process.env.NODE_ENV !== "production") {
    // Development Mode: Mount Vite Middleware
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware loaded.");
  } else {
    // Production Mode: Serve Compiled dist static files
    const distPath = options.distPath ?? path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`Local PDF Tools running at http://localhost:${actualPort}`);
      resolve({ port: actualPort });
    });
    server.on("error", reject);
  });
}

// Start automatically unless embedded (the desktop app sets LPT_EMBEDDED and calls startServer itself)
if (!process.env.LPT_EMBEDDED) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
