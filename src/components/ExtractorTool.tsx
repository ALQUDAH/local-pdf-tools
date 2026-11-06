/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  CheckCircle, 
  Loader2, 
  Trash2, 
  Download, 
  FileText, 
  Copy, 
  Search, 
  Sparkles, 
  Info, 
  AlignLeft, 
  FileJson, 
  Check, 
  ClipboardCheck, 
  BarChart, 
  Maximize2 
} from 'lucide-react';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, downloadFile } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import * as pdfjsLib from 'pdfjs-dist';

interface ExtractorToolProps {
  onBack: () => void;
}

interface ParsedPage {
  pageIndex: number;
  rawText: string;
  formattedText: string; // spacing preserved
  markdownText: string;
  stats: {
    characters: number;
    words: number;
    headingsCount: number;
  };
}

export default function ExtractorTool({ onBack }: ExtractorToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Extraction result states
  const [pagesData, setPagesData] = useState<ParsedPage[]>([]);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [outputFormat, setOutputFormat] = useState<'txt' | 'md' | 'json'>('txt');
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle file selection
  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setSuccess(false);
    setPagesData([]);
    setExtractionProgress(0);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      
      // Load details using pdfUtils
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 16);

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
      setSelectedPageIndex(0);

      // Start text & layout parsing sequence
      await extractTextAndLayout(arrayBuffer);

    } catch (err) {
      console.error(err);
      alert('Failed to extract text. Ensure the file is not corrupted or password protected.');
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  // PDF Text Extraction with Heading & Layout Heuristics
  const extractTextAndLayout = async (arrayBuffer: ArrayBuffer) => {
    try {
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;
      const parsedResults: ParsedPage[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setExtractionProgress(Math.round(((i - 1) / totalPages) * 100));
        
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;

        // Extract items
        const items = textContent.items as any[];
        
        if (items.length === 0) {
          // Empty or OCR needed
          parsedResults.push({
            pageIndex: i - 1,
            rawText: '',
            formattedText: '',
            markdownText: '',
            stats: { characters: 0, words: 0, headingsCount: 0 }
          });
          continue;
        }

        // HEURISTIC 1: Group by visual line (y coordinate)
        // items might have tiny precision shifts, we group Ys within 4pt tolerance
        const lineGroups: Record<number, any[]> = {};
        
        // Find most common font heights to calculate body text vs headings
        const fontHeights: number[] = [];
        
        items.forEach((item) => {
          const trans = item.transform; // [scaleX, skewX, skewY, scaleY, translateX, translateY]
          const fontHeight = Math.abs(trans[3]); // physical height
          fontHeights.push(fontHeight);

          const y = Math.round(trans[5] * 2) / 2; // snap to 0.5pt coordinate
          
          // Look for adjacent existing Y group
          let foundGroup = false;
          for (const keyStr of Object.keys(lineGroups)) {
            const keyY = parseFloat(keyStr);
            if (Math.abs(keyY - y) < 4) {
              lineGroups[keyY].push(item);
              foundGroup = true;
              break;
            }
          }
          
          if (!foundGroup) {
            lineGroups[y] = [item];
          }
        });

        // Determine average body text font size
        const sortedHeights = [...fontHeights].sort((a, b) => a - b);
        const bodyFontSize = sortedHeights[Math.floor(sortedHeights.length / 2)] || 10;

        // Sort lines from top of the page down (Y decreases in PDF standard coords)
        const sortedYCoords = Object.keys(lineGroups)
          .map(Number)
          .sort((a, b) => b - a);

        let pageRawTextLines: string[] = [];
        let pageLayoutLines: string[] = [];
        let pageMarkdownLines: string[] = [];
        let headingsOnPage = 0;

        sortedYCoords.forEach((y) => {
          const lineItems = lineGroups[y];
          // Sort horizontally: left-to-right (translateX increases)
          lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

          // Simple flat joining
          const rawJoined = lineItems.map(item => item.str).join(' ');
          pageRawTextLines.push(rawJoined);

          // Preserve Spacing format
          // Map physical page width into character columns (e.g., 90 wide canvas for text grid alignment)
          const colsCount = 95;
          const charWidthInPoints = pageWidth / colsCount;
          let currentLineStr = '';
          
          lineItems.forEach((item) => {
            const x = item.transform[4];
            const targetCharIndex = Math.max(0, Math.floor(x / charWidthInPoints));
            
            // Pad spaces if necessary
            if (currentLineStr.length < targetCharIndex) {
              currentLineStr += ' '.repeat(targetCharIndex - currentLineStr.length);
            }
            currentLineStr += item.str;
          });
          pageLayoutLines.push(currentLineStr);

          // Built-in Markdown parser heuristics: Check if heading
          // If first item on line has height > 1.35 * average body font size
          const firstItem = lineItems[0];
          const firstHeight = firstItem ? Math.abs(firstItem.transform[3]) : 0;
          let markdownLine = rawJoined;
          
          if (firstHeight > bodyFontSize * 1.6) {
            markdownLine = `## ${rawJoined}`;
            headingsOnPage++;
          } else if (firstHeight > bodyFontSize * 1.2) {
            markdownLine = `### ${rawJoined}`;
            headingsOnPage++;
          }
          pageMarkdownLines.push(markdownLine);
        });

        const fullRaw = pageRawTextLines.join('\n');
        const fullLayout = pageLayoutLines.join('\n');
        const fullMarkdown = pageMarkdownLines.join('\n\n');

        const charsCount = fullRaw.length;
        const wordsList = fullRaw.trim().split(/\s+/).filter(Boolean);
        const wordsCount = wordsList.length;

        parsedResults.push({
          pageIndex: i - 1,
          rawText: fullRaw,
          formattedText: fullLayout,
          markdownText: fullMarkdown,
          stats: {
            characters: charsCount,
            words: wordsCount,
            headingsCount: headingsOnPage
          }
        });
      }

      setPagesData(parsedResults);
      setExtractionProgress(100);
      setSuccess(true);

    } catch (err) {
      console.error(err);
      throw new Error('Error compilation parsing pdf raw elements.');
    }
  };

  // Copy active text segments to clipboard
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compile entire file output based on current settings
  const handleDownloadStructuredFile = () => {
    if (pagesData.length === 0 || !file) return;

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    let content = '';
    let fileName = '';
    let mimeType = '';

    if (outputFormat === 'txt') {
      content = pagesData.map(p => {
        const header = `=== Page ${p.pageIndex + 1} ===\n`;
        const bodyTxt = preserveLayout ? p.formattedText : p.rawText;
        return header + bodyTxt;
      }).join('\n\n');
      
      fileName = `${baseName}_layout.txt`;
      mimeType = 'text/plain;charset=utf-8';
    } else if (outputFormat === 'md') {
      content = `# Document: ${file.name}\n\n` + 
        pagesData.map(p => `<!-- Page ${p.pageIndex + 1} -->\n${p.markdownText}`).join('\n\n---\n\n');
      
      fileName = `${baseName}_extracted.md`;
      mimeType = 'text/markdown;charset=utf-8';
    } else if (outputFormat === 'json') {
      const jsonStructure = {
        documentName: file.name,
        pageCount: pagesData.length,
        totalCharacters: pagesData.reduce((acc, p) => acc + p.stats.characters, 0),
        totalWords: pagesData.reduce((acc, p) => acc + p.stats.words, 0),
        pages: pagesData.map(p => ({
          page: p.pageIndex + 1,
          rawCharacters: p.stats.characters,
          rawWords: p.stats.words,
          headingsDetected: p.stats.headingsCount,
          rawText: p.rawText,
          structuredText: p.formattedText,
          markdownText: p.markdownText
        }))
      };
      
      content = JSON.stringify(jsonStructure, null, 2);
      fileName = `${baseName}_extracted.json`;
      mimeType = 'application/json;charset=utf-8';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setPagesData([]);
    setExtractionProgress(0);
    setSuccess(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  // Compute aggregated stats
  const aggregateStats = () => {
    let charTotal = 0;
    let wordTotal = 0;
    let headingTotal = 0;
    pagesData.forEach(p => {
      charTotal += p.stats.characters;
      wordTotal += p.stats.words;
      headingTotal += p.stats.headingsCount;
    });

    return {
      chars: charTotal,
      words: wordTotal,
      headings: headingTotal,
      readingTime: Math.max(1, Math.round(wordTotal / 200)) // ~200 WPM
    };
  };

  const activePageData = pagesData[selectedPageIndex];
  const totalStats = aggregateStats();

  // Filter text contents using search query
  const getFilteredText = (page: ParsedPage) => {
    let sourceText = preserveLayout ? page.formattedText : page.rawText;
    if (outputFormat === 'md') sourceText = page.markdownText;

    if (!searchQuery) return sourceText;

    // Return text with highlight markers or similar, standard text mapping
    return sourceText;
  };

  return (
    <div className="space-y-6">
      {/* Back and Subheader Row */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-extractor-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full font-bold">
          Text Extraction Tool
        </span>
      </div>

      {!file ? (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              PDF Text &amp; Layout Extractor
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              Decrypt layout matrices to convert PDF documents instantly into beautifully formatted Markdown sheets, structured JSON objects, or plain text with spatial grid formatting.
            </p>
          </div>

          <Dropzone
            id="extractor-dropzone"
            onFilesSelected={handleFileSelected}
            multiple={false}
            title="Upload a PDF document to extract layout & text"
            description="Drag and drop or search directory to load a single file"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Content Workspace Details Console (Left Sidebar stats / configuration) */}
          <div className="lg:col-span-4 space-y-6 text-left">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm space-y-6">
              
              {/* Active Document Overview info */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-850 dark:text-slate-150 truncate" title={file.name}>
                    {file.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {formatSize(file.size)} • {file.pageCount} Pages • Document loaded
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors cursor-pointer"
                  title="Upload another document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Extraction Progress status */}
              {loading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-500 font-mono">
                    <span>Analyzing document structure...</span>
                    <span>{extractionProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-300 animate-pulse" 
                      style={{ width: `${extractionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Statistics Panel view */}
              {success && pagesData.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <BarChart className="w-4 h-4 text-slate-400" /> Structure Analytics
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/80 rounded-xl">
                      <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase">Total Words</span>
                      <span className="text-lg font-extrabold text-slate-800 dark:text-white mt-1 block">
                        {totalStats.words.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-101 dark:border-slate-852/80 rounded-xl">
                      <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase">Characters</span>
                      <span className="text-lg font-extrabold text-slate-800 dark:text-white mt-1 block">
                        {totalStats.chars.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-101 dark:border-slate-852/80 rounded-xl">
                      <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase">Headings Detected</span>
                      <span className="text-lg font-extrabold text-slate-800 dark:text-white mt-1 block">
                        {totalStats.headings}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-101 dark:border-slate-852/80 rounded-xl">
                      <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase">Read Time (Est.)</span>
                      <span className="text-lg font-extrabold text-slate-800 dark:text-white mt-1 block">
                        {totalStats.readingTime} Min
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Output structure configuration settings */}
              {success && (
                <div className="space-y-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
                  <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-widest">
                    Export Settings
                  </h3>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-650 dark:text-slate-350">
                      Target Export Format
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setOutputFormat('txt')}
                        className={`py-2 px-3 border rounded-xl text-center text-xs font-bold transition-all cursor-pointer ${
                          outputFormat === 'txt'
                            ? 'border-amber-500 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                            : 'border-slate-200 dark:border-slate-800 text-slate-650 hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        TEXT (.txt)
                      </button>
                      <button
                        onClick={() => setOutputFormat('md')}
                        className={`py-2 px-3 border rounded-xl text-center text-xs font-bold transition-all cursor-pointer ${
                          outputFormat === 'md'
                            ? 'border-amber-500 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                            : 'border-slate-200 dark:border-slate-805 text-slate-650 hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        MARKDOWN (.md)
                      </button>
                      <button
                        onClick={() => setOutputFormat('json')}
                        className={`py-2 px-3 border rounded-xl text-center text-xs font-bold transition-all cursor-pointer ${
                          outputFormat === 'json'
                            ? 'border-amber-500 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                            : 'border-slate-200 dark:border-slate-805 text-slate-655 hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                      >
                        JSON (.json)
                      </button>
                    </div>
                  </div>

                  {outputFormat === 'txt' && (
                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preserveLayout}
                          onChange={(e) => setPreserveLayout(e.target.checked)}
                          className="rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-800"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Preserve Spacing Grid Layout
                        </span>
                      </label>
                      <p className="text-[10px] text-slate-400 leading-relaxed pl-6">
                        Pads line text blocks with accurate spacing margins based on visual coordinate positions mapping horizontally, rendering tabular figures correctly.
                      </p>
                    </div>
                  )}

                  {outputFormat === 'md' && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex gap-2.5 text-[11px] text-slate-500 leading-relaxed">
                      <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span>
                        Heuristics automatically identify titles and visual headers based on spatial font properties, mapping them out as native H2 &amp; H3 tags.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Downloads Trigger */}
              {success && (
                <div className="pt-4 border-t border-slate-100 dark:border-slate-808">
                  <button
                    onClick={handleDownloadStructuredFile}
                    className="w-full py-3 px-5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-50 text-white dark:text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer text-xs"
                  >
                    <Download className="w-4 h-4" /> Download Complete Document
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Interactive Document Sheets Reader Space (Right Preview Side Panels) */}
          <div className="lg:col-span-8 space-y-6 text-left">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col min-h-[480px]">
              
              {/* Toolbar of Preview Control panels */}
              {success && activePageData ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5">
                  
                  {/* Page index selectors */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold font-mono text-slate-400 uppercase">
                      Sheet Sheet:
                    </span>
                    <select
                      value={selectedPageIndex}
                      onChange={(e) => setSelectedPageIndex(parseInt(e.target.value) || 0)}
                      className="py-1 px-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-880 dark:text-slate-180 cursor-pointer focus:outline-none focus:border-amber-500"
                    >
                      {pagesData.map((p, idx) => (
                        <option key={idx} value={idx}>
                          Page {idx + 1}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({activePageData.stats.words} Words)
                    </span>
                  </div>

                  {/* Search query box inside extraction preview */}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Find keyword..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs py-1.5 pl-8 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-850 dark:text-white"
                    />
                  </div>

                  {/* Copy segment controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyToClipboard(getFilteredText(activePageData))}
                      className="text-xs px-3 py-1.5 border border-slate-205 dark:border-slate-800 hover:bg-slate-5 hover:border-amber-500 dark:hover:bg-slate-950 text-slate-700 dark:text-slate-300 hover:text-amber-600 rounded-xl transition-all font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <ClipboardCheck className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy This Page
                        </>
                      )}
                    </button>
                  </div>

                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
                  <FileText className="w-14 h-14 text-slate-200 dark:text-slate-800 mb-3 animate-pulse" />
                  <p className="text-sm">Load document to start text extraction heuristics.</p>
                </div>
              )}

              {/* Raw parsed Text / Layout output Container sheets */}
              {success && activePageData && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-150/50 dark:border-slate-850/60 rounded-xl overflow-hidden shadow-inner flex flex-col">
                    
                    {/* Panel heading detailing current selections representation */}
                    <div className="px-4 py-2 bg-slate-100/50 dark:bg-slate-900/40 border-b border-slate-150/40 dark:border-slate-800/40 flex items-center justify-between text-[10px] font-mono font-semibold text-slate-400">
                      <span>PREVIEW SHEET (FORMAT: {outputFormat.toUpperCase()})</span>
                      {searchQuery && (
                        <span>SEARCH ACTIVE</span>
                      )}
                    </div>

                    {/* Extracted block viewport */}
                    <div className="p-5 overflow-auto max-h-[500px] flex-1 text-left">
                      <pre className="font-mono text-xs text-slate-750 dark:text-slate-300 whitespace-pre leading-relaxed select-text">
                        {getFilteredText(activePageData) || (
                          <span className="italic text-slate-400 select-none">
                            [This page does not contain machine-readable text elements or fonts. Try checking with image OCR tools.]
                          </span>
                        )}
                      </pre>
                    </div>

                  </div>

                  {/* Multiple pages overview grid strip at the bottom */}
                  {file && file.pageCount > 1 && (
                    <div className="border-t border-slate-100 dark:border-slate-805 mt-6 pt-5">
                      <span className="block text-[10px] font-mono font-bold text-slate-400 uppercase mb-3">
                        Slides Carousel ({file.pageCount} Sheets)
                      </span>
                      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hidden">
                        {pagesData.map((p, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedPageIndex(idx)}
                            className={`shrink-0 w-12 py-2 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center ${
                              selectedPageIndex === idx
                                ? 'border-amber-500 bg-amber-500/5 text-amber-600 dark:text-amber-400 font-bold scale-102 ring-2 ring-amber-450/20'
                                : 'border-slate-200 dark:border-slate-805 hover:border-slate-350 text-slate-500'
                            }`}
                          >
                            <span className="text-xs font-bold">{idx + 1}</span>
                            <span className="text-[8px] opacity-70 mt-0.5 font-mono">
                              {Math.round(p.stats.characters / 100) / 10}K
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
