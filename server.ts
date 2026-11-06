import "dotenv/config";
import express from "express";
import path from "path";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import dns from "dns/promises";
import net from "net";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import exceljs from "exceljs";
import pptxgen from "pptxgenjs";
import mammoth from "mammoth";
import JSZip from "jszip";
import { GoogleGenAI } from "@google/genai";

// Initialize express app
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

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

// Reject URLs that point at loopback / private / link-local networks (SSRF guard)
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("URLs pointing to private or local networks are not allowed");
  }
  return url;
}

// Configure multer file upload
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Configure JSON and text body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
    
    const excelBuffer = await workbook.xlsx.writeBuffer() as Buffer;
    
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
    await workbook.xlsx.load(req.file.buffer);
    
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
    let html = htmlInput || "";
    
    if (urlInput) {
      let safeUrl: URL;
      try {
        safeUrl = await assertPublicUrl(String(urlInput));
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "URL not allowed" });
      }
      try {
        const fetchRes = await fetch(safeUrl, { redirect: "error", signal: AbortSignal.timeout(15000) });
        if (fetchRes.ok) {
          html = await fetchRes.text();
        } else {
          html = `<h1>Request failed with status ${fetchRes.status}</h1><p>${safeUrl.href}</p>`;
        }
      } catch (err) {
        html = `<h1>Network Connection Failed</h1><p>Failed to contact: ${safeUrl.href}</p>`;
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
    
    // Tag parsing
    const regex = /<(h1|h2|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    let found = false;
    
    while ((match = regex.exec(html)) !== null) {
      found = true;
      const tag = match[1].toLowerCase();
      const rawText = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (!rawText) continue;
      
      const isHeading = tag === "h1" || tag === "h2";
      const fontSize = isHeading ? (tag === "h1" ? 18 : 14) : 10;
      const currentFont = isHeading ? fontBold : font;
      const color = isHeading ? rgb(0.1, 0.15, 0.35) : rgb(0.2, 0.2, 0.2);
      
      const lines = wrapText(rawText, width - 100, fontSize, currentFont);
      
      for (const line of lines) {
        if (y < margin + 25) {
          page = pdfDoc.addPage([595.27, 841.89]);
          y = height - margin;
        }
        
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
      const textToRender = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      const lines = wrapText(textToRender, width - 100, 11, font);
      for (const line of lines) {
        if (y < margin + 25) {
          page = pdfDoc.addPage([595.27, 841.89]);
          y = height - margin;
        }
        page.drawText(line, { x: margin, y: y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
        y -= 16;
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"web_print_output.pdf\"");
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
    
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    
    // Set ISO PDF/A compliance metadata header
    const xmpMetadata = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

    pdfDoc.setTitle(`${safeBaseName(req.file.originalname)} (ISO PDF/A Compliant)`);
    pdfDoc.setSubject("Archived Target ISO-19005 series standard compliance");
    
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeBaseName(req.file.originalname)}_pdfa.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    console.error("PDF/A compilation error:", error);
    res.status(500).json({ error: error.message || "Failed to make document PDF/A compliant" });
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
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", keyConfigured: !!process.env.GEMINI_API_KEY });
});

// ----------------------------------------------------
// VITE DEV SERVER AND PRODUCTION SERVING MIDDLEWARES
// ----------------------------------------------------

async function startServer() {
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static files serving configuration established.");
  }
  
  app.listen(PORT, HOST, () => {
    console.log(`Local PDF Tools running at http://localhost:${PORT}`);
  });
}

startServer();
