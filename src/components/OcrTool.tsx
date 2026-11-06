/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, FormEvent, useEffect } from 'react';
import { 
  ArrowLeft, CheckCircle, FileCode, Sliders, Play, Loader2, RefreshCw, 
  Download, FileText, Check, Settings, Languages, FileSearch, Edit3, 
  Sparkles, CheckSquare, Square, AlertCircle, RefreshCcw, HelpCircle,
  Eye, EyeOff, Copy, Search, Type, Trash2,
  Volume2, VolumeX, Pause, Calendar, Mail, Phone, DollarSign, Link2, 
  FileSpreadsheet, BookOpen, Activity
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PDFFile } from '../types';
import { fileToArrayBuffer, getPdfDetails, downloadFile, sanitizeForWinAnsi } from '../lib/pdfUtils';
import Dropzone from './Dropzone';
import { getTesseractOptions, ocrFontUrl } from '../lib/ocrAssets';

import { tr } from '../i18n';
interface OcrToolProps {
  onBack: () => void;
}

interface PageOcrResult {
  pageNumber: number;
  previewUrl: string;
  text: string;
  confidence?: number;
}

export function applyImageFilters(
  canvas: HTMLCanvasElement,
  options: {
    contrast: number;
    binarize: boolean;
    binarizeThreshold: number;
    sharpen: boolean;
    invert: boolean;
  }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Grayscale, Contrast, Inversion & Binarization Pass
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Grayscale (weighted ITU-R BT.601 for balanced human perception)
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Apply Contrast adjustment
    if (options.contrast !== 1.0) {
      gray = (gray - 128) * options.contrast + 128;
      gray = Math.max(0, Math.min(255, gray));
    }

    // Apply color inversion (excellent for scanned blueprints or dark mode documents)
    if (options.invert) {
      gray = 255 - gray;
    }

    // Apply binarization (strict black/white threshold filter)
    if (options.binarize) {
      gray = gray >= options.binarizeThreshold ? 255 : 0;
    }

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  // Draw filtered pixel changes back to canvas
  ctx.putImageData(imageData, 0, 0);

  // Apply Convolution-based Sharpening Filter to extract faint pixels/letter strokes
  if (options.sharpen) {
    const sw = canvas.width;
    const sh = canvas.height;
    const tempImageData = ctx.getImageData(0, 0, sw, sh);
    const tempData = tempImageData.data;
    const output = ctx.createImageData(sw, sh);
    const outData = output.data;

    // 3x3 high-pass laplacian sharpen kernel
    const kernel = [
       0, -1,  0,
      -1,  5, -1,
       0, -1,  0
    ];

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const dstOff = (y * sw + x) * 4;
        let sumR = 0, sumG = 0, sumB = 0;

        for (let ky = 0; ky < 3; ky++) {
          for (let kx = 0; kx < 3; kx++) {
            const px = Math.min(sw - 1, Math.max(0, x + kx - 1));
            const py = Math.min(sh - 1, Math.max(0, y + ky - 1));
            const srcOff = (py * sw + px) * 4;
            const weight = kernel[ky * 3 + kx];

            sumR += tempData[srcOff] * weight;
            sumG += tempData[srcOff + 1] * weight;
            sumB += tempData[srcOff + 2] * weight;
          }
        }

        outData[dstOff] = Math.max(0, Math.min(255, sumR));
        outData[dstOff + 1] = Math.max(0, Math.min(255, sumG));
        outData[dstOff + 2] = Math.max(0, Math.min(255, sumB));
        outData[dstOff + 3] = tempData[dstOff + 3]; // keep original alpha channel
      }
    }
    ctx.putImageData(output, 0, 0);
  }
}

type LangOption = {
  code: string;
  name: string;
};

const LANGUAGES: LangOption[] = [
  { code: 'eng', name: 'English (ENG)' },
  { code: 'spa', name: 'Spanish / Español (SPA)' },
  { code: 'fra', name: 'French / Français (FRA)' },
  { code: 'deu', name: 'German / Deutsch (DEU)' },
  { code: 'ita', name: 'Italian / Italiano (ITA)' },
  { code: 'por', name: 'Portuguese / Português (POR)' },
  { code: 'ara', name: 'Arabic / العربية (ARA)' },
  { code: 'chi_sim', name: 'Chinese - Simplified / 简体中文 (CHI_SIM)' },
  { code: 'chi_tra', name: 'Chinese - Traditional / 繁體中文 (CHI_TRA)' },
  { code: 'jpn', name: 'Japanese / 日本語 (JPN)' },
  { code: 'kor', name: 'Korean / 한국어 (KOR)' },
  { code: 'rus', name: 'Russian / Русский (RUS)' },
  { code: 'hin', name: 'Hindi / हिन्दी (HIN)' },
  { code: 'nld', name: 'Dutch / Nederlands (NLD)' },
  { code: 'swe', name: 'Swedish / Svenska (SWE)' },
  { code: 'tur', name: 'Turkish / Türkçe (TUR)' },
  { code: 'vie', name: 'Vietnamese / Tiếng Việt (VIE)' },
  { code: 'pol', name: 'Polish / Polski (POL)' },
];

export default function OcrTool({ onBack }: OcrToolProps) {
  const [file, setFile] = useState<PDFFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // States
  const [selectedLang, setSelectedLang] = useState('eng');
  const [ocrPages, setOcrPages] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('1');
  const [results, setResults] = useState<PageOcrResult[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);

  // Advanced Proofreading & Editing States
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [searchMatchesCount, setSearchMatchesCount] = useState<number | null>(null);

  // Preprocessing / Enhancement Configuration States
  const [contrast, setContrast] = useState<number>(1.2);
  const [binarize, setBinarize] = useState<boolean>(true);
  const [binarizeThreshold, setBinarizeThreshold] = useState<number>(130);
  const [sharpen, setSharpen] = useState<boolean>(true);
  const [invert, setInvert] = useState<boolean>(false);
  const [showPreprocessedPreview, setShowPreprocessedPreview] = useState<boolean>(true);
  const [previewFilterUrl, setPreviewFilterUrl] = useState<string>('');

  // -----------------------------------------------------------------
  // Interactive Workspace & Premium Post-processing States
  // -----------------------------------------------------------------
  const [workspaceTab, setWorkspaceTab] = useState<'proofread' | 'entities' | 'speech' | 'metrics'>('proofread');
  const [speechPlaying, setSpeechPlaying] = useState<boolean>(false);
  const [speechPaused, setSpeechPaused] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [speechVoiceName, setSpeechVoiceName] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [customRegexStr, setCustomRegexStr] = useState<string>('');

  // Auto-load browser synthesizer voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !speechVoiceName) {
        const englishVoice = voices.find(v => v.lang.startsWith('en'));
        setSpeechVoiceName(englishVoice ? englishVoice.name : voices[0].name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Generate live visual feedback for the preprocessed document layout
  useEffect(() => {
    if (!file || file.previews.length === 0) {
      setPreviewFilterUrl('');
      return;
    }

    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        applyImageFilters(canvas, {
          contrast,
          binarize,
          binarizeThreshold,
          sharpen,
          invert
        });
        setPreviewFilterUrl(canvas.toDataURL('image/jpeg', 0.82));
      }
    };
    img.src = file.previews[0];

    return () => {
      active = false;
    };
  }, [file, contrast, binarize, binarizeThreshold, sharpen, invert]);

  // Progress metrics
  const [currentStep, setCurrentStep] = useState('');
  const [currentPageNum, setCurrentPageNum] = useState(0);
  const [totalOcrPagesNum, setTotalOcrPagesNum] = useState(0);
  const [pageProgressPercent, setPageProgressPercent] = useState(0);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    return parseFloat((bytes / (k * k)).toFixed(2)) + ' MB';
  };

  const handleFileSelected = async (newRawFiles: File[]) => {
    if (newRawFiles.length === 0) return;
    setLoading(true);
    setSuccess(false);
    setResults([]);

    try {
      const sourceFile = newRawFiles[0];
      const arrayBuffer = await fileToArrayBuffer(sourceFile);
      const { pageCount, previews } = await getPdfDetails(arrayBuffer, 8); // Extract up to 8 page visuals

      setFile({
        id: Math.random().toString(36).substring(2, 9),
        file: sourceFile,
        name: sourceFile.name,
        size: sourceFile.size,
        arrayBuffer,
        pageCount,
        previews,
      });
      // Default range
      setCustomRange(`1-${Math.min(3, pageCount)}`);
    } catch (err) {
      console.error(err);
      alert(tr("Could not parsed standard PDF structures."));
    } finally {
      setLoading(false);
    }
  };

  const parseRanges = (str: string, maxPages: number): number[] => {
    const list = new Set<number>();
    const tokens = str.split(',');
    for (const token of tokens) {
      const clean = token.trim();
      if (!clean) continue;
      if (clean.includes('-')) {
        const [startStr, endStr] = clean.split('-');
        const specStart = parseInt(startStr, 10);
        const specEnd = parseInt(endStr, 10);
        if (!isNaN(specStart) && !isNaN(specEnd)) {
          const min = Math.min(specStart, specEnd);
          const max = Math.max(specStart, specEnd);
          for (let i = min; i <= max; i++) {
            if (i >= 1 && i <= maxPages) list.add(i);
          }
        }
      } else {
        const page = parseInt(clean, 10);
        if (!isNaN(page) && page >= 1 && page <= maxPages) {
          list.add(page);
        }
      }
    }
    return Array.from(list).sort((a, b) => a - b);
  };

  const handleOcrProcess = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setSuccess(false);
    setResults([]);

    try {
      // Determine pages to OCR
      let targetPages: number[] = [];
      if (ocrPages === 'all') {
        for (let i = 1; i <= file.pageCount; i++) targetPages.push(i);
      } else {
        targetPages = parseRanges(customRange, file.pageCount);
        if (targetPages.length === 0) {
          alert(tr("Please input a valid page selection index range."));
          setLoading(false);
          return;
        }
      }

      setTotalOcrPagesNum(targetPages.length);

      // Load pdf using pdfJS
      setCurrentStep(tr("Loading original document matrix..."));
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.arrayBuffer.slice(0)) });
      const pdfDoc = await loadingTask.promise;

      const pageOcrResults: PageOcrResult[] = [];

      for (let index = 0; index < targetPages.length; index++) {
        const pageNum = targetPages[index];
        setCurrentPageNum(index + 1);
        setCurrentStep(tr("Rendering high-resolution Page {0}...", pageNum));
        setPageProgressPercent(0);

        // Render page as a high quality image for OCR (scale 2.0 works great)
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Canvas render creation error.');
        }

        // Draw solid white background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        };
        await page.render(renderContext).promise;

        // Apply our custom offline image filters to maximize OCR accuracy
        applyImageFilters(canvas, {
          contrast,
          binarize,
          binarizeThreshold,
          sharpen,
          invert
        });

        const imgDataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // Perform OCR
        setCurrentStep(tr("Running Tesseract optical scanning on Page {0}...", pageNum));
        const ocrResult = await Tesseract.recognize(
          imgDataUrl,
          selectedLang,
          {
            ...getTesseractOptions(),
            logger: (m) => {
              if (m.status === 'loading tesseract core') {
                setCurrentStep(tr("Loading Tesseract Module Core..."));
                setPageProgressPercent(Math.round(m.progress * 100));
              } else if (m.status === 'initializing api') {
                setCurrentStep(tr("Initializing character OCR engine APIs..."));
                setPageProgressPercent(Math.round(m.progress * 100));
              } else if (m.status === 'loading language traineddata') {
                setCurrentStep(tr("Downloading & loading [{0}] language data package...", selectedLang.toUpperCase()));
                setPageProgressPercent(Math.round(m.progress * 100));
              } else if (m.status === 'recognizing text') {
                setCurrentStep(tr("Transcribing and extracting characters from Page {0}...", pageNum));
                setPageProgressPercent(Math.round(m.progress * 100));
              } else {
                setPageProgressPercent(Math.round(m.progress * 100));
              }
            }
          }
        );

        pageOcrResults.push({
          pageNumber: pageNum,
          previewUrl: imgDataUrl,
          text: ocrResult.data.text || `[OCR completed with no recognizable text content on page ${pageNum}]`,
          confidence: ocrResult.data.confidence || 0
        });
      }

      setResults(pageOcrResults);
      setActiveTab(0);
      setSuccess(true);
    } catch (err) {
      console.error(err);
      alert(tr("Optical character extraction failed. Ensure your PDF has compatible images."));
    } finally {
      setLoading(false);
      setPageProgressPercent(0);
      setCurrentStep('');
    }
  };

  const handleTextEdit = (index: number, newText: string) => {
    setResults(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], text: newText };
      return copy;
    });
  };

  // Preprocessing filter presets helper
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'default':
        setContrast(1.2);
        setBinarize(true);
        setBinarizeThreshold(130);
        setSharpen(true);
        setInvert(false);
        break;
      case 'faint':
        setContrast(1.8);
        setBinarize(true);
        setBinarizeThreshold(115);
        setSharpen(true);
        setInvert(false);
        break;
      case 'photocopy':
        setContrast(1.5);
        setBinarize(true);
        setBinarizeThreshold(155);
        setSharpen(true);
        setInvert(false);
        break;
      case 'blueprint':
        setContrast(1.3);
        setBinarize(true);
        setBinarizeThreshold(120);
        setSharpen(true);
        setInvert(true);
        break;
    }
  };

  // Copy to clipboard helper
  const handleCopyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.warn("Could not copy using Clipboard API:", err);
    }
  };

  // Count search phrase occurrences
  useEffect(() => {
    if (!searchTerm || results.length === 0 || results[activeTab] === undefined) {
      setSearchMatchesCount(null);
      return;
    }
    const currentText = results[activeTab].text;
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const matches = currentText.match(regex);
    setSearchMatchesCount(matches ? matches.length : 0);
  }, [searchTerm, results, activeTab]);

  // Replace active tab instances
  const executeReplace = (all = false) => {
    if (!searchTerm || results.length === 0) return;
    const currentText = results[activeTab].text;
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    let nextText = '';
    if (all) {
      const regex = new RegExp(escaped, 'gi');
      nextText = currentText.replace(regex, replaceTerm);
    } else {
      const regex = new RegExp(escaped, 'i');
      nextText = currentText.replace(regex, replaceTerm);
    }
    handleTextEdit(activeTab, nextText);
  };

  // Text formatting: strip multi-spaces
  const cleanStripDoubleSpaces = () => {
    if (results.length === 0) return;
    const currentText = results[activeTab].text;
    const nextText = currentText.replace(/[ \t]+/g, ' ');
    handleTextEdit(activeTab, nextText);
  };

  // Text formatting: join single linebreaks to read fluidly (keep double-linebreaks)
  const cleanJoinLines = () => {
    if (results.length === 0) return;
    const currentText = results[activeTab].text;
    // Split by paragraphs (double newlines)
    const paragraphs = currentText.split(/\n\s*\n/);
    const joinedParagraphs = paragraphs.map(para => {
      // Replace single newlines with spaces
      return para.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    });
    handleTextEdit(activeTab, joinedParagraphs.join('\n\n'));
  };

  // Text formatting: remove blank/empty lines
  const cleanRemoveEmptyLines = () => {
    if (results.length === 0) return;
    const currentText = results[activeTab].text;
    const nextText = currentText.split('\n').filter(line => line.trim() !== '').join('\n');
    handleTextEdit(activeTab, nextText);
  };

  // Text formatting: Case modifier
  const cleanChangeCase = (mode: 'upper' | 'lower' | 'title' | 'sentence') => {
    if (results.length === 0) return;
    const currentText = results[activeTab].text;
    let nextText = '';
    
    if (mode === 'upper') {
      nextText = currentText.toUpperCase();
    } else if (mode === 'lower') {
      nextText = currentText.toLowerCase();
    } else if (mode === 'title') {
      nextText = currentText.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
    } else if (mode === 'sentence') {
      // capitalizes first letter of sentences
      nextText = currentText.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, separator, char) => separator + char.toUpperCase());
    }
    
    handleTextEdit(activeTab, nextText);
  };

  // -----------------------------------------------------------------
  // Advanced Document Analysis & Speech Helpers
  // -----------------------------------------------------------------
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const startTTS = (textStr: string) => {
    if (!('speechSynthesis' in window)) {
      alert(tr("Local synthesis is not supported on this device."));
      return;
    }
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textStr);
    
    if (speechVoiceName) {
      const selectedVoice = window.speechSynthesis.getVoices().find(v => v.name === speechVoiceName);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    utterance.rate = speechRate;
    
    utterance.onend = () => {
      setSpeechPlaying(false);
      setSpeechPaused(false);
    };
    
    utterance.onerror = () => {
      setSpeechPlaying(false);
      setSpeechPaused(false);
    };

    ttsUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeechPlaying(true);
    setSpeechPaused(false);
  };

  const pauseTTS = () => {
    if ('speechSynthesis' in window && speechPlaying) {
      window.speechSynthesis.pause();
      setSpeechPaused(true);
    }
  };

  const resumeTTS = () => {
    if ('speechSynthesis' in window && speechPaused) {
      window.speechSynthesis.resume();
      setSpeechPaused(false);
    }
  };

  const stopTTS = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeechPlaying(false);
      setSpeechPaused(false);
    }
  };

  const countSyllables = (textVal: string): number => {
    const words = textVal.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let syllableCount = 0;
    for (const word of words) {
      let count = 0;
      const cleanWord = word.replace(/[^a-z]/g, '');
      if (cleanWord.length <= 3) {
        count = 1;
      } else {
        const vowels = cleanWord.match(/[aeiouy]{1,2}/g);
        count = vowels ? vowels.length : 1;
        if (cleanWord.endsWith('e') && !cleanWord.endsWith('le')) {
          count--;
        }
      }
      syllableCount += Math.max(1, count);
    }
    return syllableCount;
  };

  const calculateReadabilityMetrics = (textVal: string) => {
    const chars = textVal.length;
    const words = textVal.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentences = textVal.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length || 1;
    const syllableCount = countSyllables(textVal);

    if (wordCount === 0) {
      return {
        wordCount: 0,
        sentenceCount: 0,
        charCount: 0,
        avgWordLength: 0,
        readingTimeMin: 0,
        fleschScore: 100,
        fleschLabel: 'No content',
        ariScore: 0,
        ariLabel: 'N/A'
      };
    }

    const avgWordLength = chars / wordCount;
    const avgSentenceLength = wordCount / sentenceCount;
    const syllablesPerWord = syllableCount / wordCount;

    let fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * syllablesPerWord);
    fleschScore = Math.max(0, Math.min(100, fleschScore));

    let fleschLabel = 'Standard';
    if (fleschScore > 90) fleschLabel = 'Very Easy (5th-grade level, conversational)';
    else if (fleschScore > 80) fleschLabel = 'Easy (6th-grade level)';
    else if (fleschScore > 70) fleschLabel = 'Fairly Easy (7th-grade level)';
    else if (fleschScore > 60) fleschLabel = 'Standard (8th & 9th-grade level)';
    else if (fleschScore > 50) fleschLabel = 'Fairly Difficult (10th to 12th-grade level)';
    else if (fleschScore > 30) fleschLabel = 'Difficult (College level / Academic)';
    else fleschLabel = 'Very Difficult (Graduate level / Extremely Academic)';

    let ariScore = 4.71 * (chars / wordCount) + 0.5 * (wordCount / sentenceCount) - 21.43;
    ariScore = Math.max(1, Math.round(ariScore));

    let ariLabel = 'Kindergarten';
    if (ariScore === 1) ariLabel = 'Kindergarten (Age 5-6)';
    else if (ariScore === 2) ariLabel = 'First Grade (Age 6-7)';
    else if (ariScore === 3) ariLabel = 'Second Grade (Age 7-8)';
    else if (ariScore === 4) ariLabel = 'Third Grade (Age 8-9)';
    else if (ariScore === 5) ariLabel = 'Fourth Grade (Age 9-10)';
    else if (ariScore === 6) ariLabel = 'Fifth Grade (Age 10-11)';
    else if (ariScore === 7) ariLabel = 'Sixth Grade (Age 11-12)';
    else if (ariScore === 8) ariLabel = 'Seventh Grade (Age 12-13)';
    else if (ariScore === 9) ariLabel = 'Eighth Grade (Age 13-14)';
    else if (ariScore === 10) ariLabel = 'Ninth Grade (Age 14-15)';
    else if (ariScore === 11) ariLabel = 'Tenth Grade (Age 15-16)';
    else if (ariScore === 12) ariLabel = 'Eleventh Grade (Age 16-17)';
    else if (ariScore === 13) ariLabel = 'Twelfth Grade (Age 17-18)';
    else ariLabel = 'College Student / Professor (Age 18+)';

    const readingTimeMin = Math.ceil(wordCount / 225);

    return {
      wordCount,
      sentenceCount,
      charCount: chars,
      avgWordLength: parseFloat(avgWordLength.toFixed(1)),
      readingTimeMin,
      fleschScore: Math.round(fleschScore),
      fleschLabel,
      ariScore: Math.round(ariScore),
      ariLabel
    };
  };

  const extractEntitiesFromText = (textStr: string, customRegex?: string) => {
    const emails = textStr.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = textStr.match(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g) || [];
    const currencies = textStr.match(/\b[£$€¥₣₹]\s*\d+(?:,\d{3})*(?:\.\d{2})?\b|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*[£$€¥₣₹]|[A-Z]{3}\s*\d+(?:\.\d{2})?\b/g) || [];
    const dates = textStr.match(/\b\d{1,2}[-\/\s.]\d{1,2}[-\/\s.]\d{2,4}\b|\b(?:\d{4}[-\/\s.]\d{1,2}[-\/\s.]\d{1,2})\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi) || [];
    const urls = textStr.match(/\bhttps?:\/\/[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|]/gi) || [];

    let customs: string[] = [];
    if (customRegex) {
      try {
        const rx = new RegExp(customRegex, 'gi');
        customs = textStr.match(rx) || [];
      } catch (err) {
        // ignore
      }
    }

    const uniq = (arr: string[]) => Array.from(new Set(arr.map(s => s.trim())));

    return {
      emails: uniq(emails),
      phones: uniq(phones),
      currencies: uniq(currencies),
      dates: uniq(dates),
      urls: uniq(urls),
      customs: uniq(customs)
    };
  };

  const handleDownloadMarkdown = () => {
    if (results.length === 0) return;
    let mdText = `# OCR Extraction Report\n\n`;
    mdText += `* **Document Source:** \`${file?.name}\`\n`;
    mdText += `* **Processed On:** ${new Date().toLocaleString()}\n`;
    mdText += `* **Language:** \`${selectedLang.toUpperCase()}\`\n\n`;
    mdText += `---\n\n`;

    results.forEach((r) => {
      mdText += `## Page ${r.pageNumber}\n\n`;
      if (r.confidence) {
        mdText += `*Extraction Confidence:* **${Math.round(r.confidence)}%**\n\n`;
      }
      mdText += `### Text Transcript\n\n\`\`\`text\n${r.text}\n\`\`\`\n\n`;
    });

    const blob = new TextEncoder().encode(mdText);
    const baseName = file?.name.replace(/\.pdf$/i, '') || 'document';
    downloadFile(blob, `${baseName}_ocr_report.md`, 'text/markdown');
  };

  const handleDownloadJson = () => {
    if (results.length === 0) return;
    
    const dump = {
      documentName: file?.name,
      processedAt: new Date().toISOString(),
      languageProfile: selectedLang,
      stats: {
        totalPages: results.length,
        totalCharacters: results.reduce((sum, r) => sum + r.text.length, 0),
        totalWords: results.reduce((sum, r) => sum + r.text.trim().split(/\s+/).filter(Boolean).length, 0),
      },
      pages: results.map((r) => {
        const words = r.text.trim().split(/\s+/).filter(Boolean);
        const chars = r.text.length;
        const sentences = r.text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const syllableCount = countSyllables(r.text);
        const avgSentenceLength = words.length / (sentences.length || 1);
        const syllablesPerWord = syllableCount / (words.length || 1);
        let fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * syllablesPerWord);
        fleschScore = Math.max(0, Math.min(100, fleschScore));
        
        const entities = extractEntitiesFromText(r.text);

        return {
          pageNumber: r.pageNumber,
          confidence: r.confidence || null,
          characterCount: chars,
          wordCount: words.length,
          sentenceCount: sentences.length,
          readability: {
            fleschScore: Math.round(fleschScore),
            estimatedReadingTimeMin: Math.ceil(words.length / 225)
          },
          text: r.text,
          extractedEntities: entities
        };
      })
    };

    const blob = new TextEncoder().encode(JSON.stringify(dump, null, 2));
    const baseName = file?.name.replace(/\.pdf$/i, '') || 'document';
    downloadFile(blob, `${baseName}_ocr_export.json`, 'application/json');
  };

  // Text wrapper to avoid clipping the page edges
  const wrapText = (text: string, maxLen = 80): string[] => {
    const lines: string[] = [];
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      if (!para.trim()) {
        lines.push('');
        continue;
      }
      const words = para.split(/\s+/);
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + ' ' + word).length > maxLen) {
          lines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine = currentLine ? currentLine + ' ' + word : word;
        }
      }
      if (currentLine) {
        lines.push(currentLine.trim());
      }
    }
    return lines;
  };

  const handleDownloadTxt = () => {
    if (results.length === 0) return;
    let fullText = `--- OPTICAL CHARACTER RECOGNITION (OCR) REPORT ---\n`;
    fullText += `Document Source: ${file?.name}\n`;
    fullText += `Processed on: ${new Date().toLocaleString()}\n`;
    fullText += `Language Profile: ${selectedLang.toUpperCase()}\n`;
    fullText += `=================================================\n\n`;

    results.forEach((r) => {
      fullText += `--- PAGE ${r.pageNumber} ---\n\n`;
      fullText += r.text;
      fullText += `\n\n\n`;
    });

    const blob = new TextEncoder().encode(fullText);
    const baseName = file?.name.replace(/\.pdf$/i, '') || 'document';
    downloadFile(blob, `${baseName}_ocr_transcript.txt`, 'text/plain');
  };

  const handleDownloadSearchablePdf = async () => {
    if (results.length === 0) return;
    setLoading(true);
    setCurrentStep(tr("Generating searchable PDF document..."));
    
    try {
      const pdfDoc = await PDFDocument.create();
      
      // Determine if there is a custom font preset for the selected language
      const FONT_PRESETS: Record<string, string> = {
        ara: 'https://fastly.jsdelivr.net/npm/@fontsource/amiri@5.0.8/files/amiri-arabic-400-normal.ttf',
        rus: 'https://fastly.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-cyrillic-400-normal.ttf',
        hin: 'https://fastly.jsdelivr.net/npm/@fontsource/noto-sans-devanagari@5.0.20/files/noto-sans-devanagari-devanagari-400-normal.ttf',
        jpn: 'https://fastly.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.19/files/noto-sans-jp-japanese-400-normal.ttf',
        chi_sim: 'https://fastly.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.0.19/files/noto-sans-sc-chinese-simplified-400-normal.ttf',
        chi_tra: 'https://fastly.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.1.0/files/noto-sans-tc-chinese-traditional-400-normal.ttf',
        kor: 'https://fastly.jsdelivr.net/npm/@fontsource/noto-sans-kr@5.0.21/files/noto-sans-kr-korean-400-normal.ttf'
      };

      let standardFont: any = null;
      let boldFont: any = null;
      let isCustomFont = false;

      const fontUrl = FONT_PRESETS[selectedLang] ? ocrFontUrl(FONT_PRESETS[selectedLang]) : undefined;
      if (fontUrl) {
        try {
          setCurrentStep(tr("Downloading language-specific font pack for [{0}]...", selectedLang.toUpperCase()));
          const response = await fetch(fontUrl);
          if (response.ok) {
            const fontBytes = await response.arrayBuffer();
            standardFont = await pdfDoc.embedFont(fontBytes);
            boldFont = standardFont; // Use the loaded custom font as bold fallback
            isCustomFont = true;
          }
        } catch (fontErr) {
          console.warn("Could not download language-specific font. Falling back to Helvetica with sanitization.", fontErr);
        }
      }

      if (!standardFont) {
        standardFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      }

      for (const r of results) {
        // Standard Letter size (612 x 792 points)
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();

        // Helper to format string safely depending on if we have custom font
        const formatLine = (rawTxt: string) => {
          return isCustomFont ? rawTxt : sanitizeForWinAnsi(rawTxt);
        };

        // Page Header
        const headerText = `Page ${r.pageNumber} Extracted Document Transcript`;
        page.drawText(formatLine(headerText), {
          x: 40,
          y: height - 50,
          size: 14,
          font: boldFont,
          color: rgb(0.1, 0.4, 0.8),
        });

        // Horizontal Ruler Line
        page.drawLine({
          start: { x: 40, y: height - 60 },
          end: { x: width - 40, y: height - 60 },
          thickness: 1,
          color: rgb(0.8, 0.8, 0.8),
        });

        // Format Text
        const parsedParagraphs = wrapText(r.text, 75);
        let currentY = height - 85;

        for (const line of parsedParagraphs) {
          // If we reach the bottom margin, create a continuation page
          if (currentY < 40) {
            const continuationPage = pdfDoc.addPage([612, 792]);
            // Draw standard subheader
            continuationPage.drawText(formatLine(`Page ${r.pageNumber} Extracted Document Transcript (Cont.)`), {
              x: 40,
              y: height - 50,
              size: 10,
              font: boldFont,
              color: rgb(0.4, 0.4, 0.4),
            });
            continuationPage.drawLine({
              start: { x: 40, y: height - 55 },
              end: { x: width - 40, y: height - 55 },
              thickness: 0.5,
              color: rgb(0.8, 0.8, 0.8),
            });
            currentY = height - 75;
          }

          if (line.trim() === '') {
            currentY -= 12; // spacer line
            continue;
          }

          const cleanLine = formatLine(line);
          page.drawText(cleanLine, {
            x: 45,
            y: currentY,
            size: 9.5,
            font: standardFont,
            color: rgb(0.12, 0.12, 0.15),
            lineHeight: 13,
          });

          currentY -= 13;
        }
      }

      const compiledPdfBytes = await pdfDoc.save();
      const baseName = file?.name.replace(/\.pdf$/i, '') || 'document';
      downloadFile(compiledPdfBytes, `${baseName}_ocr_selectable.pdf`, 'application/pdf');
    } catch (err) {
      console.error(err);
      alert(tr("Error generating searchable transcript PDF."));
    } finally {
      setLoading(false);
      setCurrentStep('');
    }
  };

  const resetTool = () => {
    setFile(null);
    setResults([]);
    setSuccess(false);
  };

  return (
    <div className="space-y-6">
      {/* Back button and Meta-Badge */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          id="btn-ocr-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {tr("Back to Dashboard")}
        </button>
        <span className="text-xs font-mono px-3 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full font-semibold flex items-center gap-1.5 shadow-xs">
          <Sparkles className="w-3.5 h-3.5" /> {tr("High-Contrast Tesseract OCR")}
        </span>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight flex items-center gap-2">
            <FileSearch className="w-6 h-6 text-violet-500" /> {tr("Optical Character Recognition (OCR)")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {tr("Perform high-accuracy character recognition completely local in-browser. Transcribe un-selectable text grids from scans instantly.")}
          </p>
        </div>

        {/* Dropzone */}
        {!file && (
          <div className="mb-6">
            <Dropzone
              id="ocr-dropzone"
              onFilesSelected={handleFileSelected}
              multiple={false}
              title={tr("Upload scanned document to scan OCR")}
              description={tr("Upload files to run full lexical character scans on flat picture layers without server roundtrips.")}
            />
          </div>
        )}

        {/* Running Progress Panel */}
        {loading && (
          <div className="p-6 rounded-2xl bg-violet-500/5 border border-violet-500/15 space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {tr("OCR Status:")} <span className="text-violet-600 dark:text-violet-400 font-medium">{currentStep}</span>
                </span>
              </div>
              {currentPageNum > 0 && (
                <span className="text-xs font-mono font-bold bg-violet-100 dark:bg-violet-950 px-2 py-0.5 rounded text-violet-600">
                  {tr("Page")} {currentPageNum} {tr("of")} {totalOcrPagesNum}
                </span>
              )}
            </div>

            {/* Overall & page step loaders */}
            {totalOcrPagesNum > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-405 font-mono">
                  <span>{tr("Recognition cycle completion")}</span>
                  <span>{pageProgressPercent}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div 
                    style={{ width: `${pageProgressPercent}%` }} 
                    className="bg-violet-500 h-full rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Successful OCR layout views */}
        {file && !loading && (
          <form onSubmit={handleOcrProcess} className="space-y-6">
            {results.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                
                {/* Left side: Upload details or thumbnail cover */}
                <div className="space-y-6">
                  <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    {tr("Target Document Profile")}
                  </span>

                  <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center gap-4">
                      {file.previews.length > 0 ? (
                        <div className="flex gap-1 overflow-x-auto p-1 max-w-[150px] shrink-0">
                          <img
                            src={file.previews[0]}
                            alt={tr("document thumb")}
                            referrerPolicy="no-referrer"
                            className="w-16 h-22 object-cover rounded-md shadow-md border border-slate-200 bg-white"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-22 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 shrink-0 text-slate-404">
                          <FileCode className="w-8 h-8" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{file.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-404 mt-1 font-semibold">{formatSize(file.size)}</p>
                        <span className="text-xs font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded inline-block text-slate-600 dark:text-slate-300 mt-2">
                          {file.pageCount} {tr("Pages Loaded")}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-850 flex justify-end">
                      <button
                        type="button"
                        onClick={resetTool}
                        className="text-xs font-semibold text-rose-500 hover:text-rose-600 cursor-pointer"
                      >
                        {tr("Change File")}
                      </button>
                    </div>
                  </div>

                  {/* Image Preprocessing & Clarity Enhancer Box */}
                  <div className="p-5 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold font-mono tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-violet-500" /> {tr("Preprocessing Filters")}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowPreprocessedPreview(!showPreprocessedPreview)}
                        className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:text-violet-750 flex items-center gap-1 cursor-pointer"
                      >
                        {showPreprocessedPreview ? (
                          <>
                            <EyeOff className="w-3 h-3" /> {tr("Hide Preview")}
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" /> {tr("Show Preview")}
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-normal">
                      {tr("Clarify and sharpen character edges by converting page layers. Real-time thresholding cleans up shadows and scanned line noises local-side.")}
                    </p>

                    {/* Quick filter presets */}
                    <div className="space-y-1.5 pt-1">
                      <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
                        {tr("Quick Scanning Presets")}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'default', label: tr("📄 Standard") },
                          { id: 'faint', label: tr("✍️ Faint / Light Print") },
                          { id: 'photocopy', label: tr("🌑 Photocopy / Shadow") },
                          { id: 'blueprint', label: tr("📐 Blueprint Inverted") }
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => applyPreset(p.id)}
                            className="px-2 py-1 text-[9.5px] font-bold rounded-md border border-slate-200/80 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300 hover:border-violet-500/50 hover:text-violet-600 dark:hover:text-violet-400 transition-all cursor-pointer"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Contrast Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <span>{tr("Contrast stretch factor")}</span>
                          <span className="font-mono text-violet-650 dark:text-violet-400">{contrast.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="2.5"
                          step="0.1"
                          value={contrast}
                          onChange={(e) => setContrast(parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-600"
                        />
                      </div>

                      {/* Binarization Toggle & Slider */}
                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={binarize}
                            onChange={(e) => setBinarize(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-700 text-violet-650 tracking-wide"
                          />
                          <span>{tr("Strict Black / White (Binarize)")}</span>
                        </label>

                        {binarize && (
                          <div className="space-y-1 ps-5">
                            <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              <span>{tr("Cutoff threshold limit")}</span>
                              <span className="font-mono text-violet-650 dark:text-violet-400">{binarizeThreshold} / 255</span>
                            </div>
                            <input
                              type="range"
                              min="50"
                              max="200"
                              step="5"
                              value={binarizeThreshold}
                              onChange={(e) => setBinarizeThreshold(parseInt(e.target.value, 10))}
                              className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-violet-600"
                            />
                          </div>
                        )}
                      </div>

                      {/* Convolution sharpening & text inversion */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-[10px] font-semibold text-slate-650 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={sharpen}
                            onChange={(e) => setSharpen(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-705 text-violet-605 focus:ring-violet-500 w-3.5 h-3.5"
                          />
                          <span>{tr("Sharpen Edges")}</span>
                        </label>

                        <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-[10px] font-semibold text-slate-650 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={invert}
                            onChange={(e) => setInvert(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-705 text-violet-605 focus:ring-violet-500 w-3.5 h-3.5"
                          />
                          <span>{tr("Invert Colors")}</span>
                        </label>
                      </div>
                    </div>

                    {/* Preprocessed Live Preview Frame */}
                    {showPreprocessedPreview && previewFilterUrl && (
                      <div className="pt-3 border-t border-slate-200 dark:border-slate-850 space-y-2">
                        <span className="block text-[10px] font-semibold text-slate-450 dark:text-slate-400">
                          {tr("Interactive Live Filter Result (Page 1 preview):")}
                        </span>
                        <div className="relative border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden aspect-[1/1.3] flex items-center justify-center max-h-[180px]">
                          <img
                            src={previewFilterUrl}
                            alt={tr("Filter preview")}
                            className="h-full object-contain"
                          />
                          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-violet-600/80 dark:bg-violet-500/80 text-white font-mono text-[8px] font-semibold tracking-wider">
                            {tr("FILTERED VIEW")}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Informative tips box */}
                  <div className="p-4 rounded-xl bg-violet-600/5 border border-violet-500/10 space-y-2 text-xs">
                    <h5 className="font-bold text-violet-750 dark:text-violet-300 flex items-center gap-1">
                      <Languages className="w-3.5 h-3.5 shrink-0" /> {tr("Local WebOCR Notice")}
                    </h5>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      {tr("All calculations process strictly standard client-side sandbox environments using WebAssembly. None of your sensitive intellectual details or scanned layout data will ever be sent over external APIs.")}
                    </p>
                  </div>
                </div>

                {/* Right side: OCR settings toggles */}
                <div className="space-y-6">
                  <span className="block text-xs font-bold font-mono tracking-widest text-slate-400 uppercase">
                    {tr("Config Character Recognition Matchers")}
                  </span>

                  {/* OCR Language */}
                  <div className="space-y-2">
                    <label htmlFor="ocr-lang-selector" className="block text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-violet-500" /> {tr("Language Dictionary")}
                    </label>
                    <select
                      id="ocr-lang-selector"
                      value={selectedLang}
                      onChange={(e) => setSelectedLang(e.target.value)}
                      className="w-full px-3.5 py-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none text-slate-800 dark:text-slate-100 font-semibold cursor-pointer"
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Page Range selection */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-violet-500" /> {tr("Process Page Selector")}
                    </label>

                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                      {[
                        { id: 'all', label: `Scan All Pages (${file.pageCount})` },
                        { id: 'custom', label: tr("Custom Range index") }
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setOcrPages(t.id as 'all' | 'custom')}
                          id={`btn-ocr-pages-${t.id}`}
                          className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            ocrPages === t.id
                              ? 'bg-violet-500 text-white shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {ocrPages === 'custom' && (
                      <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3 animate-fade-in">
                        <label htmlFor="ocr-custom-pages" className="block text-xs font-bold text-slate-500 dark:text-slate-450">
                          {tr("Specify page range (e.g. 1-2, 4)")}
                        </label>
                        <input
                          type="text"
                          id="ocr-custom-pages"
                          value={customRange}
                          onChange={(e) => setCustomRange(e.target.value)}
                          placeholder="e.g. 1-2, 5"
                          className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-violet-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Submit Scan Trigger */}
                  <button
                    type="submit"
                    className="w-full py-4 bg-violet-600 hover:bg-violet-505 text-white font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    <Play className="w-4 h-4 fill-white" /> {tr("Start Optical Scan Recognition")}
                  </button>
                </div>
              </div>
            ) : (
              // Results dashboard with side-by-side edit transcription previews
              <div className="space-y-6">
                
                {/* Download Actions & Headers list */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 bg-violet-550/5 dark:bg-violet-500/5 border border-violet-550/15 dark:border-violet-500/10 rounded-2xl">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">{tr("OCR Analysis Complete!")}</h4>
                    <p className="text-xs text-slate-550 dark:text-slate-400 mt-1">
                      {tr("Extract elements verified. Select formats to save local.")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={handleDownloadTxt}
                      id="btn-ocr-download-txt"
                      className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                      title={tr("Download full document text transcript")}
                    >
                      <Download className="w-3.5 h-3.5" /> {tr("TXT")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadMarkdown}
                      id="btn-ocr-download-md"
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                      title={tr("Download copy styled as Markdown report")}
                    >
                      <BookOpen className="w-3.5 h-3.5" /> {tr("Markdown")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      id="btn-ocr-download-json"
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-550 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                      title={tr("Export all structural parameters to JSON dump")}
                    >
                      <FileCode className="w-3.5 h-3.5" /> {tr("JSON Data")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSearchablePdf}
                      id="btn-ocr-download-pdf"
                      className="px-3.5 py-2 bg-violet-600 hover:bg-violet-550 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-colors"
                      title={tr("Download searchable vector PDF")}
                    >
                      <FileSearch className="w-3.5 h-3.5" /> {tr("Searchable PDF")}
                    </button>
                    <button
                      type="button"
                      onClick={resetTool}
                      id="btn-ocr-new"
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      {tr("Reset Tool")}
                    </button>
                  </div>
                </div>

                {/* Page Tabs select container */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 h-full min-h-[480px]">
                  
                  {/* Left Column: List of processed items (3 cells) */}
                  <div className="md:col-span-3 space-y-2 max-h-[500px] overflow-y-auto pe-2 scrollbar-thin">
                    <span className="block text-[10px] font-bold font-mono tracking-widest text-slate-400 uppercase mb-2">
                      {tr("Scan Pages Output")}
                    </span>
                    {results.map((r, idx) => (
                      <button
                        key={r.pageNumber}
                        type="button"
                        onClick={() => setActiveTab(idx)}
                        className={`w-full p-2.5 rounded-xl border text-start flex items-center gap-3 transition-all cursor-pointer ${
                          activeTab === idx
                            ? 'border-violet-500 bg-violet-500/5 ring-2 ring-violet-500/20'
                            : 'border-slate-200 dark:border-slate-801 bg-white hover:bg-slate-50 dark:bg-slate-900/40'
                        }`}
                      >
                        <img
                          src={r.previewUrl}
                          alt={tr("page {0} layout cover", r.pageNumber)}
                          referrerPolicy="no-referrer"
                          className="w-10 h-14 object-cover rounded bg-slate-100 border shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5 min-w-0">
                            <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate pe-1">
                              {tr("Page")} {r.pageNumber}
                            </span>
                            {r.confidence !== undefined && r.confidence > 0 && (
                              <span className={`text-[8.5px] px-1 py-0.2 rounded font-mono font-bold shrink-0 ${
                                r.confidence >= 80 
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                                  : r.confidence >= 55 
                                  ? 'bg-amber-500/10 text-amber-500' 
                                  : 'bg-rose-500/10 text-rose-500'
                              }`}>
                                {Math.round(r.confidence)}%
                              </span>
                            )}
                          </div>
                          <span className="block text-[10px] font-mono text-slate-450 mt-1 truncate">
                            {r.text.length} {tr("characters recognized")}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Right Column: Active sheet preview and editable textarea (9 cells) */}
                  <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-slate-50 dark:bg-slate-950/45 rounded-2xl border border-slate-150 dark:border-slate-805">
                    
                    {/* Active page scan thumbnail */}
                    <div className="space-y-3 shrink-0">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>{tr("Physical Page Visual scan")}</span>
                        <span className="font-mono bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-650">
                          {tr("PAGE")} {results[activeTab].pageNumber}
                        </span>
                      </div>
                      <div className="border border-slate-200 dark:border-slate-800 bg-white aspect-[1/1.41] rounded shadow-md overflow-hidden flex items-center justify-center">
                        <img
                          src={results[activeTab].previewUrl}
                          alt={tr("active visual layout view")}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>

                    {/* Editable active text transcript with premium utility controls & post-processing tabs */}
                    <div className="flex flex-col space-y-4">
                      
                      {/* Premium Interactive Workspace Tabs Header */}
                      <div className="flex flex-wrap items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-2.5 gap-2">
                        <div className="flex flex-wrap gap-1 bg-slate-100/80 dark:bg-slate-950/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
                          {[
                            { id: 'proofread', label: tr("✍️ Editor"), desc: tr("Proofread text") },
                            { id: 'entities', label: tr("🔍 Extractor"), desc: tr("Find variables/data") },
                            { id: 'speech', label: tr("🗣️ Reader"), desc: tr("Listen to document") },
                            { id: 'metrics', label: tr("📊 Metrics"), desc: tr("Readability score") }
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setWorkspaceTab(tab.id as any);
                                if (tab.id !== 'speech') {
                                  stopTTS();
                                }
                              }}
                              className={`px-3 py-1.5 text-[11.5px] font-bold rounded-lg transition-all cursor-pointer ${
                                workspaceTab === tab.id
                                  ? 'bg-violet-650 text-white shadow-xs'
                                  : 'text-slate-505 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/40 dark:hover:bg-slate-900'
                              }`}
                              title={tab.desc}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(results[activeTab].text)}
                          className="px-2.5 py-1.5 text-[10.5px] font-bold text-violet-650 dark:text-violet-400 border border-violet-100 dark:border-violet-900/40 hover:border-violet-550 hover:text-violet-750 bg-white hover:bg-violet-50 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-xl cursor-pointer transition-all flex items-center gap-1 shrink-0"
                        >
                          {copyFeedback ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" /> {tr("Copied!")}
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" /> {tr("Copy Text")}
                            </>
                          )}
                        </button>
                      </div>

                      {/* WORKSPACE TAB 1: PROOFREADER EDITOR */}
                      {workspaceTab === 'proofread' && (
                        <div className="space-y-3 animate-fade-in">
                          
                          {/* Search & Replace Block */}
                          <div className="space-y-2 bg-slate-100/40 dark:bg-slate-950/30 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs">
                            <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-500">
                              <span className="flex items-center gap-1 font-mono tracking-wide">
                                <Search className="w-3.5 h-3.5 text-violet-500" /> {tr("SEARCH & REPLACE MATCHES")}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  placeholder={tr("Type keyword to find...")}
                                  className="w-full ps-7 pe-16 py-1.5 text-[11px] bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-750 rounded-md focus:outline-none focus:border-violet-500 font-mono text-slate-800 dark:text-slate-100"
                                />
                                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                                {searchMatchesCount !== null && (
                                  <span className="absolute right-2 top-1.5 text-[9px] font-bold font-mono px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                    {searchMatchesCount} {tr("hit")}{searchMatchesCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex gap-1">
                                <input
                                  type="text"
                                  value={replaceTerm}
                                  onChange={(e) => setReplaceTerm(e.target.value)}
                                  placeholder={tr("Replace with...")}
                                  className="flex-1 px-2.5 py-1.5 text-[11px] bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-750 rounded-md focus:outline-none focus:border-violet-500 font-mono text-slate-800 dark:text-slate-100"
                                />
                                <button
                                  type="button"
                                  onClick={() => executeReplace(false)}
                                  disabled={!searchTerm}
                                  className="px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-705 dark:text-slate-300 text-[10px] font-bold rounded-md hover:bg-slate-250 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  {tr("Replace")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => executeReplace(true)}
                                  disabled={!searchTerm}
                                  className="px-2 py-1.5 bg-violet-600 text-white text-[10px] font-bold rounded-md hover:bg-violet-550 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  {tr("All")}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Formatting Row */}
                          <div className="flex flex-col gap-2 p-2 bg-slate-50 dark:bg-slate-950/30 border border-slate-200/80 dark:border-slate-800/80 rounded-xl">
                            <div className="flex flex-wrap gap-1 items-center pb-1.5 border-b border-slate-200/60 dark:border-slate-800/60">
                              <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wide font-mono me-1.5 shrink-0">{tr("Cleaners:")}</span>
                              <button
                                type="button"
                                onClick={cleanJoinLines}
                                title={tr("Removes single newlines to join broken lines of text into continuous paragraphs automatically")}
                                className="px-2 py-1 text-[10px] font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-violet-500 hover:text-violet-600 rounded-md transition-colors cursor-pointer"
                              >
                                {tr("Flow Paragraphs")}
                              </button>
                              <button
                                type="button"
                                onClick={cleanStripDoubleSpaces}
                                title={tr("Trims duplicate spaces and trailing tabulators")}
                                className="px-2 py-1 text-[10px] font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-violet-500 hover:text-violet-600 rounded-md transition-colors cursor-pointer"
                              >
                                {tr("Trim Spaces")}
                              </button>
                              <button
                                type="button"
                                onClick={cleanRemoveEmptyLines}
                                title={tr("Discard completely empty lines")}
                                className="px-2 py-1 text-[10px] font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-violet-500 hover:text-violet-600 rounded-md transition-colors cursor-pointer"
                              >
                                {tr("Strip Empty Lines")}
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1 items-center">
                              <span className="text-[9px] font-bold text-slate-455 uppercase tracking-wide font-mono me-1.5 shrink-0">{tr("Case Modifiers:")}</span>
                              <button
                                type="button"
                                onClick={() => cleanChangeCase('sentence')}
                                className="px-2 py-0.5 text-[10px] font-semibold hover:text-violet-650 dark:hover:text-violet-400 text-slate-655 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors"
                              >
                                {tr("Sentence")}
                              </button>
                              <button
                                type="button"
                                onClick={() => cleanChangeCase('title')}
                                className="px-2 py-0.5 text-[10px] font-semibold hover:text-violet-655 dark:hover:text-violet-400 text-slate-655 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors"
                              >
                                {tr("Title")}
                              </button>
                              <button
                                type="button"
                                onClick={() => cleanChangeCase('upper')}
                                className="px-2 py-0.5 text-[10px] font-semibold hover:text-violet-655 dark:hover:text-violet-400 text-slate-655 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors"
                              >
                                {tr("UPPER")}
                              </button>
                              <button
                                type="button"
                                onClick={() => cleanChangeCase('lower')}
                                className="px-2 py-0.5 text-[10px] font-semibold hover:text-violet-655 dark:hover:text-violet-400 text-slate-655 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer transition-colors"
                              >
                                {tr("lower")}
                              </button>
                            </div>
                          </div>

                          <textarea
                            value={results[activeTab].text}
                            onChange={(e) => handleTextEdit(activeTab, e.target.value)}
                            className="w-full p-4 text-xs bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-750 text-slate-800 dark:text-slate-100 font-mono leading-relaxed rounded-xl focus:outline-none focus:border-violet-500 resize-none h-[250px] overflow-y-auto"
                            placeholder={tr("Page text transcript content...")}
                          />
                        </div>
                      )}

                      {/* WORKSPACE TAB 2: PATTERN ENTITIES EXTRACTOR */}
                      {workspaceTab === 'entities' && (
                        <div className="space-y-4 animate-fade-in bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5 font-sans">
                              {tr("📊 Lexical Entity Extractor (Client-Side)")}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {tr("Analyzes the active page transcript inline using static token filters to capture indices. Click items to copy them.")}
                            </p>
                          </div>

                          {/* Custom Regex search bar */}
                          <div className="space-y-1.5 p-3 bg-violet-500/5 dark:bg-violet-955/10 rounded-xl border border-violet-500/10">
                            <label htmlFor="custom-regex" className="block text-[10px] font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider font-mono">
                              {tr("✏️ Run Custom Pattern (Regular Expression)")}
                            </label>
                            <div className="flex gap-1.5">
                              <input
                                type="text"
                                id="custom-regex"
                                value={customRegexStr}
                                onChange={(e) => setCustomRegexStr(e.target.value)}
                                placeholder="e.g. \b[A-Z]{3}-\d{4}\b"
                                className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-violet-500 font-mono text-slate-800 dark:text-slate-150"
                              />
                            </div>
                          </div>

                          {/* Render Categories */}
                          <div className="space-y-3.5 max-h-[280px] overflow-y-auto pe-1">
                            {(() => {
                              const ents = extractEntitiesFromText(results[activeTab].text, customRegexStr);
                              const categories = [
                                { id: 'emails', name: '✉️ Email Addresses', items: ents.emails, icon: Mail, empty: 'No email targets recognized.' },
                                { id: 'phones', name: '📞 Telephone Matches', items: ents.phones, icon: Phone, empty: 'No phone lines parsed.' },
                                { id: 'currencies', name: '💵 Currency & Values', items: ents.currencies, icon: DollarSign, empty: 'No monetary symbols matched.' },
                                { id: 'dates', name: '📅 Chronological Dates', items: ents.dates, icon: Calendar, empty: 'No timeline values identified.' },
                                { id: 'urls', name: '🔗 Hyperlink URLs', items: ents.urls, icon: Link2, empty: 'No web addresses parsed.' },
                                { id: 'customs', name: '🎯 Custom Regex Matches', items: ents.customs, icon: TargetColIconPlaceholder, empty: 'No matches for custom pattern.', showIfNotEmpty: true }
                              ];

                              function TargetColIconPlaceholder({ className }: { className?: string }) {
                                return <Activity className={className} />;
                              }

                              return categories.map((cat) => {
                                if (cat.id === 'customs' && !customRegexStr) return null;
                                return (
                                  <div key={cat.id} className="space-y-1.5 border-b border-slate-100 dark:border-slate-850 pb-3 last:border-0 last:pb-0">
                                    <span className="text-[10px] font-bold text-slate-505 uppercase tracking-wide flex items-center gap-1.5 font-mono">
                                      <cat.icon className="w-3.5 h-3.5 text-violet-500" /> {cat.name} ({cat.items.length})
                                    </span>
                                    {cat.items.length === 0 ? (
                                      <span className="block text-[10px] text-slate-400 italic ps-5">{cat.empty}</span>
                                    ) : (
                                      <div className="flex flex-wrap gap-1.5 ps-5">
                                        {cat.items.map((item, index) => (
                                          <button
                                            key={`${cat.id}-${index}`}
                                            type="button"
                                            onClick={() => handleCopyToClipboard(item)}
                                            className="px-2 py-1 text-[10px] font-bold font-mono bg-slate-100 hover:bg-violet-100 dark:bg-slate-800 dark:hover:bg-violet-950 text-slate-700 dark:text-slate-300 hover:text-violet-650 dark:hover:text-violet-300 rounded-md transition-all cursor-pointer border border-transparent dark:border-slate-800 flex items-center gap-1 align-middle"
                                            title={tr("Click to copy value")}
                                          >
                                            {item} <Copy className="w-2.5 h-2.5 opacity-40 shrink-0" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* WORKSPACE TAB 3: SPEECH SYNTHESIS TTS PLAYER */}
                      {workspaceTab === 'speech' && (
                        <div className="space-y-4 animate-fade-in bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[300px]">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                              {tr("🔊 Offline Speech Synthesizer & Auditor")}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {tr("Listen to the optical character scan aloud. Ideal for auditing, reviewing, and proofreading complex documents.")}
                            </p>
                          </div>

                          {/* Sound wave animated simulator */}
                          <div className="h-16 bg-slate-50 dark:bg-slate-950 rounded-2xl flex items-center justify-center gap-1 p-3 border border-slate-100 dark:border-slate-850">
                            {speechPlaying && !speechPaused ? (
                              <div className="flex items-center gap-1">
                                {[...Array(12)].map((_, i) => (
                                  <span
                                    key={i}
                                    style={{ animationDelay: `${i * 120}ms` }}
                                    className="w-1 bg-gradient-to-t from-violet-600 to-indigo-400 rounded-full animate-pulse h-4"
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-400 capitalize">
                                {speechPaused ? tr("⏸️ Reading stream paused") : tr("⏹️ Synthesizer line ready")}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            {/* Voice selector */}
                            <div className="space-y-1">
                              <label htmlFor="voice-select" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                                {tr("Synthesized Voice Pack")}
                              </label>
                              <select
                                id="voice-select"
                                value={speechVoiceName}
                                onChange={(e) => setSpeechVoiceName(e.target.value)}
                                className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none"
                              >
                                {availableVoices.map((v) => (
                                  <option key={v.name} value={v.name}>
                                    {v.name} ({v.lang})
                                  </option>
                                ))}
                                {availableVoices.length === 0 && (
                                  <option value="">{tr("Default OS Voice Native")}</option>
                                )}
                              </select>
                            </div>

                            {/* Speed selector */}
                            <div className="space-y-1">
                              <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                                {tr("Playing Velocity Rate (")}{speechRate}x)
                              </span>
                              <div className="grid grid-cols-4 gap-1">
                                {[0.75, 1.0, 1.25, 1.5].map((rate) => (
                                  <button
                                    key={rate}
                                    type="button"
                                    onClick={() => setSpeechRate(rate)}
                                    className={`py-1.5 text-[10px] font-bold rounded ${
                                      speechRate === rate
                                        ? 'bg-violet-600 text-white'
                                        : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-850'
                                    }`}
                                  >
                                    {rate}x
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Control row */}
                          <div className="flex gap-2.5 justify-center pt-3 border-t border-slate-100 dark:border-slate-850">
                            {!speechPlaying || speechPaused ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (speechPaused) {
                                    resumeTTS();
                                  } else {
                                    startTTS(results[activeTab].text);
                                  }
                                }}
                                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-550 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" /> {speechPaused ? tr("Resume Reading") : tr("Read Aloud")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={pauseTTS}
                                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-450 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                              >
                                <Pause className="w-3.5 h-3.5 inline-block" /> {tr("Pause")}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={stopTTS}
                              disabled={!speechPlaying && !speechPaused}
                              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-150 transition-colors"
                            >
                              <Square className="w-3.5 h-3.5 fill-slate-400" /> {tr("Stop Stream")}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* WORKSPACE TAB 4: READABILITY & DOCUMENT KPIS */}
                      {workspaceTab === 'metrics' && (
                        <div className="space-y-4 animate-fade-in bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[300px]">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                              {tr("📈 Real-Time Readability & Document KPIs")}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {tr("Automated linguistic metrics for content accessibility, complex vocabulary, and estimated speed benchmarks.")}
                            </p>
                          </div>

                          {(() => {
                            const m = calculateReadabilityMetrics(results[activeTab].text);
                            return (
                              <div className="space-y-4 flex-1 pt-2">
                                {/* Double gauge bento layout */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {/* Flesch Reading Score */}
                                  <div className="p-3 bg-violet-500/5 border border-violet-500/10 rounded-xl space-y-1">
                                    <span className="text-[9px] font-bold text-violet-750 dark:text-violet-400 uppercase tracking-wide font-mono block">{tr("Flesch Reading Ease score")}</span>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-2xl font-black text-violet-650 dark:text-violet-300 font-mono">{m.fleschScore}</span>
                                      <span className="text-[10px] text-slate-400 font-semibold font-sans">/ 100</span>
                                    </div>
                                    <p className="text-[10px] text-slate-505 dark:text-slate-400 leading-tight font-medium font-sans">
                                      {tr("Complexity:")} <strong>{m.fleschLabel}</strong>
                                    </p>
                                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1.5">
                                      <div
                                        style={{ width: `${m.fleschScore}%` }}
                                        className="bg-violet-600 h-full rounded-full transition-all duration-500"
                                      />
                                    </div>
                                  </div>

                                  {/* Automated Readability Grade Index */}
                                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl space-y-1">
                                    <span className="text-[9px] font-bold text-emerald-750 dark:text-emerald-400 uppercase tracking-wide font-mono block">{tr("Understandability Grade")}</span>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-xl font-black text-emerald-650 dark:text-emerald-300 font-mono">{tr("Grade")} {m.ariScore}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-505 dark:text-slate-400 leading-tight font-medium font-sans mt-0.5">
                                      {tr("Target profile:")} <strong>{m.ariLabel}</strong>
                                    </p>
                                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-2">
                                      <div
                                        style={{ width: `${Math.min(100, (m.ariScore / 14) * 100)}%` }}
                                        className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Count Grid */}
                                <div className="grid grid-cols-3 gap-2.5 text-center">
                                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">{tr("Word Count")}</span>
                                    <span className="text-base font-bold text-slate-700 dark:text-slate-250 font-mono mt-0.5 block">{m.wordCount}</span>
                                  </div>
                                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">{tr("Sentence Count")}</span>
                                    <span className="text-base font-bold text-slate-700 dark:text-slate-250 font-mono mt-0.5 block">{m.sentenceCount}</span>
                                  </div>
                                  <div className="p-2.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-850">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">{tr("Audit Duration")}</span>
                                    <span className="text-base font-bold text-slate-700 dark:text-slate-250 font-mono mt-0.5 block">{m.readingTimeMin} {tr("min")}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[10px] text-emerald-700 dark:text-emerald-400 mt-2">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{tr("Worksheets update live as edits occur in standard editor screens.")}</span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
