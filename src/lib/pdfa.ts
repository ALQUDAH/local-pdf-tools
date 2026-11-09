/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// PDF/A-2b preparation, shared by the browser app and the Node server (no DOM APIs used).
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { srgbIccProfile } from './srgbIcc';

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Prepares a PDF for PDF/A-2b: embeds PDF/A identification and matching XMP metadata,
 * an sRGB output intent, and a document ID. Full conformance also requires that every
 * font in the source is already embedded; validate the result with veraPDF if it matters.
 */
export async function preparePdfA(data: ArrayBuffer | Uint8Array, fileName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(data, { updateMetadata: false });
  const now = new Date();
  const title = pdf.getTitle() || fileName.replace(/\.pdf$/i, '');
  const author = pdf.getAuthor() || '';
  const producer = 'Local PDF Tools (pdf-lib)';
  const creator = pdf.getCreator() || 'Local PDF Tools';
  const created = pdf.getCreationDate() || now;

  // Info dictionary and XMP must agree for PDF/A
  pdf.setTitle(title);
  pdf.setProducer(producer);
  pdf.setCreator(creator);
  pdf.setCreationDate(created);
  pdf.setModificationDate(now);
  if (author) pdf.setAuthor(author);

  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdfaid:part>2</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>
   ${author ? `<dc:creator><rdf:Seq><rdf:li>${escapeXml(author)}</rdf:li></rdf:Seq></dc:creator>` : ''}
   <xmp:CreatorTool>${escapeXml(creator)}</xmp:CreatorTool>
   <xmp:CreateDate>${iso(created)}</xmp:CreateDate>
   <xmp:ModifyDate>${iso(now)}</xmp:ModifyDate>
   <xmp:MetadataDate>${iso(now)}</xmp:MetadataDate>
   <pdf:Producer>${escapeXml(producer)}</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const ctx = pdf.context;
  const metadata = ctx.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
  pdf.catalog.set(PDFName.of('Metadata'), ctx.register(metadata));

  const icc = ctx.stream(srgbIccProfile(), { N: 3 });
  const outputIntent = ctx.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: ctx.register(icc),
  });
  pdf.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(outputIntent)]));

  // PDF/A requires a file identifier
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);

  return pdf.save({ useObjectStreams: false });
}
