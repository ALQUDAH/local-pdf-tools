/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Combine, 
  Scissors, 
  FileImage, 
  Lock, 
  Moon, 
  Sun, 
  ShieldCheck, 
  Cpu, 
  CheckCircle,
  FileText,
  Images,
  RotateCw,
  RefreshCw,
  ArrowDownAZ,
  Hash,
  Sliders,
  Type,
  PenTool,
  FileSearch,
  Grid,
  Layers,
  Camera,
  Heart,
  GitCompare,
  Sparkles,
  Layers as LayersIcon,
  Wrench,
  Maximize,
  Frame,
  Unlock,
  Globe,
  FileCode,
  Edit3,
  FileSpreadsheet,
  MonitorPlay,
  FileDigit,
  Search,
  X,
  Filter,
  Languages
} from 'lucide-react';
import { useI18n, LANGUAGES } from './i18n';
import { ActiveTool } from './types';
const MergeTool = React.lazy(() => import('./components/MergeTool'));
const SplitTool = React.lazy(() => import('./components/SplitTool'));
const ImgConvertTool = React.lazy(() => import('./components/ImgConvertTool'));
const ProtectTool = React.lazy(() => import('./components/ProtectTool'));
const ImagesToPdfTool = React.lazy(() => import('./components/ImagesToPdfTool'));
const RotateTool = React.lazy(() => import('./components/RotateTool'));
const OrganizeTool = React.lazy(() => import('./components/OrganizeTool'));
const AddPageNumbersTool = React.lazy(() => import('./components/AddPageNumbersTool'));
const CompressTool = React.lazy(() => import('./components/CompressTool'));
const WatermarkTool = React.lazy(() => import('./components/WatermarkTool'));
const MetadataTool = React.lazy(() => import('./components/MetadataTool'));
const SignTool = React.lazy(() => import('./components/SignTool'));
const OcrTool = React.lazy(() => import('./components/OcrTool'));
const NUpTool = React.lazy(() => import('./components/NUpTool'));
const OverlayTool = React.lazy(() => import('./components/OverlayTool'));
const FormFillerTool = React.lazy(() => import('./components/FormFillerTool'));

const ScannedDocumentTool = React.lazy(() => import('./components/ScannedDocumentTool'));
const BatchConverterTool = React.lazy(() => import('./components/BatchConverterTool'));
const ExtractorTool = React.lazy(() => import('./components/ExtractorTool'));
const CompareTool = React.lazy(() => import('./components/CompareTool'));
const GrayscaleTool = React.lazy(() => import('./components/GrayscaleTool'));
const CropTool = React.lazy(() => import('./components/CropTool'));
const FormBuilderTool = React.lazy(() => import('./components/FormBuilderTool'));
const BatesTool = React.lazy(() => import('./components/BatesTool'));
const RedactTool = React.lazy(() => import('./components/RedactTool'));
import ThemeSwitcher, { ThemeMode } from './components/ThemeSwitcher';

const FlattenTool = React.lazy(() => import('./components/FlattenTool'));
const RepairTool = React.lazy(() => import('./components/RepairTool'));
const ResizeTool = React.lazy(() => import('./components/ResizeTool'));
const MarginTool = React.lazy(() => import('./components/MarginTool'));
import PerformanceDashboard from './components/PerformanceDashboard';
import ContinueBar from './components/ContinueBar';
import { clearPendingFile } from './lib/handoff';
import NotSupportedClientSideTool from './components/NotSupportedClientSideTool';
const ConvertTool = React.lazy(() => import('./components/ConvertTool'));
const EditPdfTool = React.lazy(() => import('./components/EditPdfTool'));

interface ToolDefinition {
  id: ActiveTool;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  iconBgClass: string;
  iconTextClass: string;
  hoverTextClass: string;
}

const TOOLS: ToolDefinition[] = [
  {
    id: 'crop',
    title: 'Page Cropper & Margin Trim',
    description: 'Crop margins, eliminate headers, or trim custom canvas portions from single or multiple pages visually.',
    icon: Scissors,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'formbuilder',
    title: 'Interactive Form Builder',
    description: 'Add fillable text fields and interactive checkboxes straight onto scanned templates with standard compliance.',
    icon: FileText,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'bates',
    title: 'Bates Numbering & Legal Stamp',
    description: 'Stamp sequential legal corporate series stamps (e.g. LIT-CASE-000001) onto multi-page documents.',
    icon: Hash,
    colorClass: 'hover:border-emerald-400 dark:hover:border-emerald-400',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'flatten',
    title: 'Flatten PDF',
    description: 'Convert interactive form fields and annotations into static, uneditable visual text layers.',
    icon: LayersIcon,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'repair',
    title: 'Repair PDF',
    description: 'Attempt to recover and rebuild corrupted or damaged PDF documents automatically by regenerating cross-reference tables structure.',
    icon: Wrench,
    colorClass: 'hover:border-sky-500 dark:hover:border-sky-500',
    iconBgClass: 'bg-sky-500/10',
    iconTextClass: 'text-sky-600 dark:text-sky-400',
    hoverTextClass: 'group-hover:text-sky-600 dark:group-hover:text-sky-400'
  },
  {
    id: 'resize',
    title: 'Resize Pages',
    description: 'Standardize page dimensions. Automatically scale contents accurately to A4, Letter, or Legal standard formats.',
    icon: Maximize,
    colorClass: 'hover:border-indigo-500 dark:hover:border-indigo-500',
    iconBgClass: 'bg-indigo-500/10',
    iconTextClass: 'text-indigo-600 dark:text-indigo-400',
    hoverTextClass: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
  },
  {
    id: 'addmargin',
    title: 'Add Margins',
    description: 'Downscale the inner content of documents to preserve sheet size but add generous white padding for printing or binding rings.',
    icon: Frame,
    colorClass: 'hover:border-fuchsia-500 dark:hover:border-fuchsia-500',
    iconBgClass: 'bg-fuchsia-500/10',
    iconTextClass: 'text-fuchsia-600 dark:text-fuchsia-400',
    hoverTextClass: 'group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-400'
  },
  {
    id: 'redact',
    title: 'Permanent Redaction & Blackout',
    description: 'Permanently destroy private identifiers or corporate segments with irreversible localized security blocks.',
    icon: ShieldCheck,
    colorClass: 'hover:border-rose-500 dark:hover:border-rose-500',
    iconBgClass: 'bg-rose-550/10',
    iconTextClass: 'text-rose-600 dark:text-rose-400',
    hoverTextClass: 'group-hover:text-rose-600 dark:group-hover:text-rose-450'
  },
  {
    id: 'compare',
    title: 'Visual Layout Compare & Diff',
    description: 'Compare two PDFs back-to-back. Highlights paragraph modifications, visual coordinate layout shifts, and legal revisions entirely offline.',
    icon: GitCompare,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'grayscale',
    title: 'Grayscale & Monochrome',
    description: 'Save desktop printer toner and filter assets entirely local. Desaturate PDF document components, or apply office photocopier high-contrast filters.',
    icon: Sparkles,
    colorClass: 'hover:border-teal-500 dark:hover:border-teal-500',
    iconBgClass: 'bg-teal-500/10',
    iconTextClass: 'text-teal-600 dark:text-teal-400',
    hoverTextClass: 'group-hover:text-teal-600 dark:group-hover:text-teal-400'
  },
  {
    id: 'extractor',
    title: 'Text & Layout Extractor',
    description: 'Deconstruct PDF documents page-by-page. Preserve physical text spacing, or convert text blocks into standard Markdown sheets and structured JSON.',
    icon: FileSearch,
    colorClass: 'hover:border-orange-500 dark:hover:border-orange-500',
    iconBgClass: 'bg-orange-500/10',
    iconTextClass: 'text-orange-600 dark:text-orange-400',
    hoverTextClass: 'group-hover:text-orange-600 dark:group-hover:text-orange-400'
  },
  {
    id: 'batchconverter',
    title: 'Batch Converter',
    description: 'Convert multiple files at once. Upload any mix of PDFs or images, choose format outputs (PDF, JPG, PNG), and download with single ZIP bundling.',
    icon: RefreshCw,
    colorClass: 'hover:border-violet-500 dark:hover:border-violet-500',
    iconBgClass: 'bg-violet-500/10',
    iconTextClass: 'text-violet-600 dark:text-violet-400',
    hoverTextClass: 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  },
  {
    id: 'formfiller',
    title: 'Interactive Form Filler',
    description: 'Auto-detect interactive form fields, type answers, check checkboxes, insert drop-downs, or stamp custom overlays in real-time.',
    icon: FileText,
    colorClass: 'hover:border-amber-500 dark:hover:border-amber-500',
    iconBgClass: 'bg-amber-500/10',
    iconTextClass: 'text-amber-600 dark:text-amber-400',
    hoverTextClass: 'group-hover:text-amber-600 dark:group-hover:text-amber-400'
  },
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple documents, reorder their pages, and compile them into a single PDF.',
    icon: Combine,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Extract certain custom pages or ranges (e.g. 1-3, 5) out into a new document.',
    icon: Scissors,
    colorClass: 'hover:border-sky-500 dark:hover:border-sky-500',
    iconBgClass: 'bg-sky-500/10',
    iconTextClass: 'text-sky-600 dark:text-sky-400',
    hoverTextClass: 'group-hover:text-sky-600 dark:group-hover:text-sky-400'
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Significantly optimize file dimensions client-side. Convert embedded visual blobs into compressed raster structures.',
    icon: Sliders,
    colorClass: 'hover:border-teal-500 dark:hover:border-teal-500',
    iconBgClass: 'bg-teal-500/10',
    iconTextClass: 'text-teal-600 dark:text-teal-400',
    hoverTextClass: 'group-hover:text-teal-600 dark:group-hover:text-teal-400'
  },
  {
    id: 'images',
    title: 'PDF to Images',
    description: 'Render every individual sheet of a PDF into high-quality downloadable JPG images.',
    icon: FileImage,
    colorClass: 'hover:border-violet-500 dark:hover:border-violet-500',
    iconBgClass: 'bg-violet-500/10',
    iconTextClass: 'text-violet-600 dark:text-violet-400',
    hoverTextClass: 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  },
  {
    id: 'imagestopdf',
    title: 'Images to PDF',
    description: 'Combine portrait and landscape photos or scanned forms directly into one standard vector PDF.',
    icon: Images,
    colorClass: 'hover:border-amber-500 dark:hover:border-amber-500',
    iconBgClass: 'bg-amber-500/10',
    iconTextClass: 'text-amber-600 dark:text-amber-400',
    hoverTextClass: 'group-hover:text-amber-600 dark:group-hover:text-amber-400'
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Rotate individual sheets or apply bulk rotation. Correct inverted document scans or upside-down records.',
    icon: RotateCw,
    colorClass: 'hover:border-indigo-500 dark:hover:border-indigo-500',
    iconBgClass: 'bg-indigo-500/10',
    iconTextClass: 'text-indigo-600 dark:text-indigo-400',
    hoverTextClass: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
  },
  {
    id: 'organize',
    title: 'Organize PDF',
    description: 'Reorder, delete, replicate, or insert blank spacer pages visually to refine your PDF package flows.',
    icon: ArrowDownAZ,
    colorClass: 'hover:border-pink-500 dark:hover:border-pink-500',
    iconBgClass: 'bg-pink-500/10',
    iconTextClass: 'text-pink-600 dark:text-pink-400',
    hoverTextClass: 'group-hover:text-pink-600 dark:group-hover:text-pink-400'
  },
  {
    id: 'pagenumbers',
    title: 'Add Page Numbers',
    description: 'Configure stamp alignments, running page index formulas, and header-skip parameters for reports.',
    icon: Hash,
    colorClass: 'hover:border-purple-500 dark:hover:border-purple-500',
    iconBgClass: 'bg-purple-500/10',
    iconTextClass: 'text-purple-600 dark:text-purple-400',
    hoverTextClass: 'group-hover:text-purple-600 dark:group-hover:text-purple-400'
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    description: 'Add standard security permissions and open-passwords to secure any PDF locally.',
    icon: Lock,
    colorClass: 'hover:border-rose-500 dark:hover:border-rose-500',
    iconBgClass: 'bg-rose-500/10',
    iconTextClass: 'text-rose-600 dark:text-rose-400',
    hoverTextClass: 'group-hover:text-rose-600 dark:group-hover:text-rose-400'
  },
  {
    id: 'watermark',
    title: 'Watermark PDF',
    description: 'Add security stamp labels diagonally, centered, or in repeating grids with custom density and fonts.',
    icon: Type,
    colorClass: 'hover:border-rose-450 dark:hover:border-rose-450',
    iconBgClass: 'bg-rose-500/10',
    iconTextClass: 'text-rose-500 dark:text-rose-400',
    hoverTextClass: 'group-hover:text-rose-550 dark:group-hover:text-rose-400'
  },
  {
    id: 'metadata',
    title: 'Edit Metadata',
    description: 'Revise PDF indexing tags, author profiles, SEO search keywords, and publishing systems.',
    icon: FileText,
    colorClass: 'hover:border-violet-500 dark:hover:border-violet-500',
    iconBgClass: 'bg-violet-500/10',
    iconTextClass: 'text-violet-600 dark:text-violet-400',
    hoverTextClass: 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  },
  {
    id: 'sign',
    title: 'Sign PDF',
    description: 'Draw a handwritten ink stamp, input stylized typography, or upload transparent signatures onto specific pages.',
    icon: PenTool,
    colorClass: 'hover:border-sky-500 dark:hover:border-sky-500',
    iconBgClass: 'bg-sky-500/10',
    iconTextClass: 'text-sky-600 dark:text-sky-400',
    hoverTextClass: 'group-hover:text-sky-600 dark:group-hover:text-sky-400'
  },
  {
    id: 'ocr',
    title: 'Optical Character Scanning (OCR)',
    description: 'Perform client-side optical character extraction to read scanned documents, edit text, and save as searchable PDF or TXT.',
    icon: FileSearch,
    colorClass: 'hover:border-violet-500 dark:hover:border-violet-500',
    iconBgClass: 'bg-violet-500/10',
    iconTextClass: 'text-violet-600 dark:text-violet-400',
    hoverTextClass: 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  },
  {
    id: 'nup',
    title: 'N-Up Print Layout',
    description: 'Arrange multiple document pages into rows and columns on a single print plate. Customize sheet size, flow direction, grids, and boundaries.',
    icon: Grid,
    colorClass: 'hover:border-teal-500 dark:hover:border-teal-500',
    iconBgClass: 'bg-teal-500/10',
    iconTextClass: 'text-teal-600 dark:text-teal-400',
    hoverTextClass: 'group-hover:text-teal-600 dark:group-hover:text-teal-400'
  },
  {
    id: 'overlay',
    title: 'PDF Layer Overlay',
    description: 'Superimpose images, stamps, seals, signatures, or multi-page templates onto standard PDFs with millimeter-precise positioning.',
    icon: Layers,
    colorClass: 'hover:border-violet-500 dark:hover:border-violet-500',
    iconBgClass: 'bg-violet-500/10',
    iconTextClass: 'text-violet-600 dark:text-violet-400',
    hoverTextClass: 'group-hover:text-violet-600 dark:group-hover:text-violet-400'
  },
  {
    id: 'scanner',
    title: 'Document Scanner',
    description: 'Digitize physical documents using your device\'s camera. Includes real-time shadow removal filters, alignment/rotate controls, and margins auto-crop.',
    icon: Camera,
    colorClass: 'hover:border-teal-500 dark:hover:border-teal-500',
    iconBgClass: 'bg-teal-500/10',
    iconTextClass: 'text-teal-600 dark:text-teal-400',
    hoverTextClass: 'group-hover:text-teal-600 dark:group-hover:text-teal-400'
  },
  {
    id: 'pdftoword',
    title: 'PDF to Word',
    description: "Extract the text of a PDF into an editable Word document. Runs in your browser.",
    icon: FileText,
    colorClass: 'hover:border-blue-500 dark:hover:border-blue-500',
    iconBgClass: 'bg-blue-500/10',
    iconTextClass: 'text-blue-600 dark:text-blue-400',
    hoverTextClass: 'group-hover:text-blue-600 dark:group-hover:text-blue-400'
  },
  {
    id: 'pdftopowerpoint',
    title: 'PDF to PowerPoint',
    description: "Turn each PDF page into a PowerPoint slide with its text. Runs in your browser.",
    icon: MonitorPlay,
    colorClass: 'hover:border-orange-500 dark:hover:border-orange-500',
    iconBgClass: 'bg-orange-500/10',
    iconTextClass: 'text-orange-600 dark:text-orange-400',
    hoverTextClass: 'group-hover:text-orange-600 dark:group-hover:text-orange-400'
  },
  {
    id: 'pdftoexcel',
    title: 'PDF to Excel',
    description: "Copy text and simple tables from a PDF into an Excel spreadsheet. Runs in your browser.",
    icon: FileSpreadsheet,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'wordtopdf',
    title: 'Word to PDF',
    description: "Convert the text of a Word document (.docx) into a PDF. Runs in your browser.",
    icon: FileText,
    colorClass: 'hover:border-blue-500 dark:hover:border-blue-500',
    iconBgClass: 'bg-blue-500/10',
    iconTextClass: 'text-blue-600 dark:text-blue-400',
    hoverTextClass: 'group-hover:text-blue-600 dark:group-hover:text-blue-400'
  },
  {
    id: 'powerpointtopdf',
    title: 'PowerPoint to PDF',
    description: "Convert the text of PowerPoint slides (.pptx) into PDF pages. Runs in your browser.",
    icon: MonitorPlay,
    colorClass: 'hover:border-orange-500 dark:hover:border-orange-500',
    iconBgClass: 'bg-orange-500/10',
    iconTextClass: 'text-orange-600 dark:text-orange-400',
    hoverTextClass: 'group-hover:text-orange-600 dark:group-hover:text-orange-400'
  },
  {
    id: 'exceltopdf',
    title: 'Excel to PDF',
    description: "Convert Excel sheets (.xlsx) into a readable PDF. Runs in your browser.",
    icon: FileSpreadsheet,
    colorClass: 'hover:border-emerald-500 dark:hover:border-emerald-500',
    iconBgClass: 'bg-emerald-500/10',
    iconTextClass: 'text-emerald-600 dark:text-emerald-400',
    hoverTextClass: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
  },
  {
    id: 'editpdf',
    title: 'Edit PDF',
    description: 'Add text, images, shapes, or freehand annotations to a PDF document directly in the browser.',
    icon: Edit3,
    colorClass: 'hover:border-amber-500 dark:hover:border-amber-500',
    iconBgClass: 'bg-amber-500/10',
    iconTextClass: 'text-amber-600 dark:text-amber-400',
    hoverTextClass: 'group-hover:text-amber-600 dark:group-hover:text-amber-400'
  },
  {
    id: 'htmltopdf',
    title: 'HTML to PDF',
    description: "Convert HTML code or files to PDF in your browser. Converting a web page by URL needs the self-hosted server.",
    icon: Globe,
    colorClass: 'hover:border-indigo-500 dark:hover:border-indigo-500',
    iconBgClass: 'bg-indigo-500/10',
    iconTextClass: 'text-indigo-600 dark:text-indigo-400',
    hoverTextClass: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
  },
  {
    id: 'unlockpdf',
    title: 'Unlock PDF',
    description: 'Remove PDF password security, giving you the freedom to use your PDFs as you want. (Uses ProtectTool components).',
    icon: Unlock,
    colorClass: 'hover:border-green-500 dark:hover:border-green-500',
    iconBgClass: 'bg-green-500/10',
    iconTextClass: 'text-green-600 dark:text-green-400',
    hoverTextClass: 'group-hover:text-green-600 dark:group-hover:text-green-400'
  },
  {
    id: 'pdftopdfa',
    title: 'PDF to PDF/A',
    description: "Prepare a PDF for long-term archiving (PDF/A-2b metadata and color profile). Runs in your browser.",
    icon: FileDigit,
    colorClass: 'hover:border-gray-500 dark:hover:border-gray-500',
    iconBgClass: 'bg-gray-500/10',
    iconTextClass: 'text-gray-600 dark:text-gray-400',
    hoverTextClass: 'group-hover:text-gray-600 dark:group-hover:text-gray-400'
  },
  {
    id: 'translatepdf',
    title: 'Translate PDF',
    description: "Translate the text of a PDF with AI (Google Gemini). Needs the self-hosted server or desktop app and your own API key.",
    icon: Globe,
    colorClass: 'hover:border-blue-500 dark:hover:border-blue-500',
    iconBgClass: 'bg-blue-500/10',
    iconTextClass: 'text-blue-600 dark:text-blue-400',
    hoverTextClass: 'group-hover:text-blue-600 dark:group-hover:text-blue-400'
  }
];

interface ToolGroup {
  name: string;
  shortName: string;
  tools: ActiveTool[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    name: "Organize Documents",
    shortName: "Organize",
    tools: ['merge', 'split', 'organize', 'nup', 'resize', 'addmargin', 'crop', 'rotate']
  },
  {
    name: "Edit & Modify",
    shortName: "Edit",
    tools: ['pagenumbers', 'bates', 'formbuilder', 'formfiller', 'flatten', 'editpdf']
  },
  {
    name: "Convert & Optimize",
    shortName: "Convert",
    tools: ['imagestopdf', 'images', 'compress', 'batchconverter', 'extractor', 'grayscale', 'pdftopdfa']
  },
  {
    name: "Analysis & Extraction",
    shortName: "Analysis & OCR",
    tools: ['ocr', 'scanner', 'compare', 'metadata', 'translatepdf']
  },
  {
    name: "Security & Protection",
    shortName: "Security",
    tools: ['protect', 'unlockpdf', 'redact', 'sign', 'watermark', 'overlay', 'repair']
  },
  {
    name: "Convert from PDF",
    shortName: "PDF to Office",
    tools: ['pdftoword', 'pdftopowerpoint', 'pdftoexcel']
  },
  {
    name: "Convert to PDF",
    shortName: "Office to PDF",
    tools: ['wordtopdf', 'powerpointtopdf', 'exceltopdf', 'htmltopdf']
  }
];

export default function App() {
  const { t, lang, setLang, toolText, groupText } = useI18n();
  // Running inside the desktop app (Electron): all tools, including server ones, work locally
  const isDesktop = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
  const [activeTool, setActiveTool] = useState<ActiveTool>('dashboard');
  // A handed-off file is only for the tool chosen right after; drop it when going back home
  useEffect(() => {
    if (activeTool === 'dashboard') clearPendingFile();
  }, [activeTool]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [pinnedTools, setPinnedTools] = useState<ActiveTool[]>(() => {
    try {
      const saved = localStorage.getItem('pdf-pinned-tools');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed as ActiveTool[];
        }
      }
    } catch (err) {
      console.error('Failed to load pinned tools:', err);
    }
    return [];
  });

  const togglePin = (toolId: ActiveTool) => {
    setPinnedTools(prev => {
      const newPinned = prev.includes(toolId)
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId];
      localStorage.setItem('pdf-pinned-tools', JSON.stringify(newPinned));
      return newPinned;
    });
  };

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('pdf-theme-mode');
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved as ThemeMode;
    return 'system';
  });

  const isInitialMount = useRef(true);

  // Global keyboard shortcut to focus search with '/' or 'Cmd/Ctrl+K'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        if (activeTool !== 'dashboard') {
          setActiveTool('dashboard');
        }
        setTimeout(() => {
          searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          searchInputRef.current?.focus();
        }, 50);
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool]);

  // Sync theme mode with DOM element class, using high-performance CSS Transitions
  useEffect(() => {
    localStorage.setItem('pdf-theme-mode', themeMode);
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    let activeTimer: NodeJS.Timeout | null = null;
    
    const applyThemeClass = (useTransition: boolean) => {
      let isDark = false;
      if (themeMode === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = themeMode === 'dark';
      }

      if (useTransition) {
        document.documentElement.classList.add('theme-transition');
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        activeTimer = setTimeout(() => {
          document.documentElement.classList.remove('theme-transition');
        }, 400);
      } else {
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    // Skip transitions on initial mount
    applyThemeClass(!isInitialMount.current);
    if (isInitialMount.current) {
      isInitialMount.current = false;
    }

    if (themeMode === 'system') {
      const listener = (e: MediaQueryListEvent) => {
        document.documentElement.classList.add('theme-transition');
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        if (activeTimer) clearTimeout(activeTimer);
        activeTimer = setTimeout(() => {
          document.documentElement.classList.remove('theme-transition');
        }, 400);
      };
      mediaQuery.addEventListener('change', listener);
      return () => {
        mediaQuery.removeEventListener('change', listener);
        if (activeTimer) clearTimeout(activeTimer);
      };
    }

    return () => {
      if (activeTimer) clearTimeout(activeTimer);
    };
  }, [themeMode]);

  // Render sub-tools
  const renderActiveTool = () => {
    switch (activeTool) {
      case 'merge':
        return <MergeTool onBack={() => setActiveTool('dashboard')} />;
      case 'split':
        return <SplitTool onBack={() => setActiveTool('dashboard')} />;
      case 'images':
        return <ImgConvertTool onBack={() => setActiveTool('dashboard')} />;
      case 'protect':
        return <ProtectTool onBack={() => setActiveTool('dashboard')} />;
      case 'imagestopdf':
        return <ImagesToPdfTool onBack={() => setActiveTool('dashboard')} />;
      case 'rotate':
        return <RotateTool onBack={() => setActiveTool('dashboard')} />;
      case 'organize':
        return <OrganizeTool onBack={() => setActiveTool('dashboard')} />;
      case 'pagenumbers':
        return <AddPageNumbersTool onBack={() => setActiveTool('dashboard')} />;
      case 'compress':
        return <CompressTool onBack={() => setActiveTool('dashboard')} />;
      case 'watermark':
        return <WatermarkTool onBack={() => setActiveTool('dashboard')} />;
      case 'metadata':
        return <MetadataTool onBack={() => setActiveTool('dashboard')} />;
      case 'sign':
        return <SignTool onBack={() => setActiveTool('dashboard')} />;
      case 'ocr':
        return <OcrTool onBack={() => setActiveTool('dashboard')} />;
      case 'nup':
        return <NUpTool onBack={() => setActiveTool('dashboard')} />;
      case 'overlay':
        return <OverlayTool onBack={() => setActiveTool('dashboard')} />;
      case 'scanner':
        return <ScannedDocumentTool onBack={() => setActiveTool('dashboard')} />;
      case 'formfiller':
        return <FormFillerTool onBack={() => setActiveTool('dashboard')} />;
      case 'batchconverter':
        return <BatchConverterTool onBack={() => setActiveTool('dashboard')} />;
      case 'extractor':
        return <ExtractorTool onBack={() => setActiveTool('dashboard')} />;
      case 'compare':
        return <CompareTool onBack={() => setActiveTool('dashboard')} />;
      case 'grayscale':
        return <GrayscaleTool onBack={() => setActiveTool('dashboard')} />;
      case 'crop':
        return <CropTool onBack={() => setActiveTool('dashboard')} />;
      case 'formbuilder':
        return <FormBuilderTool onBack={() => setActiveTool('dashboard')} />;
      case 'bates':
        return <BatesTool onBack={() => setActiveTool('dashboard')} />;
      case 'redact':
        return <RedactTool onBack={() => setActiveTool('dashboard')} />;
      case 'flatten':
        return <FlattenTool onBack={() => setActiveTool('dashboard')} />;
      case 'repair':
        return <RepairTool onBack={() => setActiveTool('dashboard')} />;
      case 'resize':
        return <ResizeTool onBack={() => setActiveTool('dashboard')} />;
      case 'addmargin':
        return <MarginTool onBack={() => setActiveTool('dashboard')} />;
      case 'unlockpdf':
        return <ProtectTool onBack={() => setActiveTool('dashboard')} initialMode="decrypt" />;
      case 'pdftoword':
      case 'pdftopowerpoint':
      case 'pdftoexcel':
      case 'wordtopdf':
      case 'powerpointtopdf':
      case 'exceltopdf':
      case 'htmltopdf':
      case 'pdftopdfa':
      case 'translatepdf':
        return <ConvertTool toolId={activeTool} onBack={() => setActiveTool('dashboard')} />;
      case 'editpdf':
        return <EditPdfTool onBack={() => setActiveTool('dashboard')} />;
      default:
        return renderDashboard();
    }
  };

  const renderToolCard = (tool: ToolDefinition) => {
    const isPinned = pinnedTools.includes(tool.id);
    const IconComponent = tool.icon;
    const text = toolText(tool.id, tool);
    
    return (
      <div
        key={tool.id}
        onClick={() => setActiveTool(tool.id)}
        id={`card-${tool.id}`}
        className={`flex flex-col items-start justify-between text-start p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl ${tool.colorClass} hover:shadow-lg dark:hover:bg-slate-900/60 shadow-xs transition-all duration-300 group cursor-pointer relative overflow-hidden`}
      >
        <div className="flex w-full justify-between items-start mb-4">
          <div className={`p-3 ${tool.iconBgClass} ${tool.iconTextClass} rounded-xl group-hover:scale-105 transition-transform`}>
            <IconComponent className="w-6 h-6" />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePin(tool.id);
            }}
            id={`pin-btn-${tool.id}`}
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-450 transition-all duration-200 cursor-pointer shadow-2xs border border-transparent dark:border-slate-800"
            title={isPinned ? t('pin.remove') : t('pin.add')}
            aria-label={isPinned ? t('pin.remove') : t('pin.add')}
          >
            <Heart className={`w-4 h-4 transition-transform duration-200 active:scale-75 ${
              isPinned 
                ? "fill-rose-500 text-rose-500 scale-110" 
                : "text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
            }`} />
          </button>
        </div>
        <div>
          <h3 className={`text-lg font-bold text-slate-800 dark:text-slate-100 ${tool.hoverTextClass} transition-colors`}>
            {text.title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            {text.description}
          </p>
        </div>
      </div>
    );
  };

  // Render the core dashboard grid
  const renderDashboard = () => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const isSearching = trimmedQuery.length > 0;

    // Filter tools by title, description, or id
    const matchingTools = TOOLS.filter(tool => {
      if (isSearching) {
        const translated = toolText(tool.id, tool);
        const matchesTitle = tool.title.toLowerCase().includes(trimmedQuery) || translated.title.toLowerCase().includes(trimmedQuery);
        const matchesDesc = tool.description.toLowerCase().includes(trimmedQuery) || translated.description.toLowerCase().includes(trimmedQuery);
        const matchesId = tool.id.toLowerCase().includes(trimmedQuery);
        if (!matchesTitle && !matchesDesc && !matchesId) {
          return false;
        }
      }

      if (selectedCategory === 'all') {
        return true;
      }
      if (selectedCategory === 'pinned') {
        return pinnedTools.includes(tool.id);
      }
      const group = TOOL_GROUPS.find(g => g.name === selectedCategory || g.shortName === selectedCategory);
      if (group) {
        return group.tools.includes(tool.id);
      }
      return true;
    });

    return (
      <div className="space-y-8">
        {/* Intro Hero banner */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-8 md:p-12 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-indigo-500/10 to-transparent pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 font-semibold text-xs font-mono rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('hero.badge')}
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {t(isDesktop ? 'hero.titleDesktop' : 'hero.title')}
            </h1>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed">
              {t(isDesktop ? 'hero.bodyDesktop' : 'hero.body')}
            </p>
          </div>
        </div>

        {/* Dashboard Top Search & Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 shadow-xs transition-all space-y-4">
          <div className="relative flex items-center">
            <div className="absolute start-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <Search className="w-5 h-5" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="w-full ps-12 pe-32 py-3.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-950 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm md:text-base outline-none transition-all duration-200 shadow-inner"
              id="dashboard-search-input"
              aria-label={t('search.aria')}
            />
            <div className="absolute end-3.5 flex items-center gap-2">
              {searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-xs font-medium flex items-center gap-1 cursor-pointer"
                  title={t('search.clearTitle')}
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs">{t('search.clear')}</span>
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 select-none">
                  <span className="text-[10px]">{t('search.press')}</span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">/</span>
                  <span className="text-[10px]">{t('search.or')}</span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">⌘K</span>
                </kbd>
              )}
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono hidden md:inline-flex items-center">
                {isSearching ? t('search.found', { n: matchingTools.length }) : t('search.tools', { n: TOOLS.length })}
              </span>
            </div>
          </div>

          {/* Quick Filter Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-slate-400 dark:text-slate-500 me-1 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> {t('filter.category')}
            </span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {t('filter.all', { n: TOOLS.length })}
            </button>
            {pinnedTools.length > 0 && (
              <button
                onClick={() => setSelectedCategory(selectedCategory === 'pinned' ? 'all' : 'pinned')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'pinned'
                    ? 'bg-rose-500 text-white shadow-xs font-semibold'
                    : 'bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                }`}
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                {t('filter.pinned', { n: pinnedTools.length })}
              </button>
            )}
            {TOOL_GROUPS.map((group) => {
              const count = group.tools.length;
              const isSelected = selectedCategory === group.name;
              return (
                <button
                  key={group.name}
                  onClick={() => setSelectedCategory(isSelected ? 'all' : group.name)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {groupText(group.name, group.shortName).short} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtered View (When searching or specific category selected) */}
        {(isSearching || selectedCategory !== 'all') ? (
          <div>
            {matchingTools.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs animate-fade-in my-4">
                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                  {t('empty.title')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                  {isSearching ? (
                    <>{t('empty.noMatch', { q: searchQuery })}</>
                  ) : (
                    <>{t('empty.noCategory')}</>
                  )}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{t('empty.popular')}</span>
                  {['Merge', 'Split', 'Compress', 'Protect', 'OCR', 'Sign', 'Watermark', 'Rotate'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        setSearchQuery(tag.toLowerCase());
                        setSelectedCategory('all');
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-2"
                >
                  <X className="w-4 h-4" /> {t('empty.reset')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold font-mono tracking-widest text-slate-500 dark:text-slate-400 uppercase">
                      {isSearching
                        ? t('results.search', { n: matchingTools.length })
                        : `${selectedCategory === 'pinned' ? t('results.pinned') : groupText(selectedCategory, '').name} (${matchingTools.length})`}
                    </h2>
                    {isSearching && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                        {t('results.matching', { q: searchQuery })}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    }}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium cursor-pointer"
                  >
                    {t('results.clear')}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full animate-fade-in">
                  {matchingTools.map(renderToolCard)}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Default Dashboard View (All Categories) */
          <div className="space-y-12">
            {/* Pinned Utilities Section */}
            {pinnedTools.length > 0 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-sm font-bold font-mono tracking-widest text-rose-500 dark:text-rose-400 uppercase flex items-center gap-2">
                  <Heart className="w-4 h-4 fill-rose-500 text-rose-500 animate-pulse" /> {t('results.pinned')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {TOOLS.filter(t => pinnedTools.includes(t.id)).map(renderToolCard)}
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-6" />
              </div>
            )}

            {/* Grouped Tools */}
            {TOOL_GROUPS.map((group) => {
              const groupTools = TOOLS.filter(t => group.tools.includes(t.id as any));
              if (groupTools.length === 0) return null;
              return (
                <div key={group.name} className="space-y-4 flex flex-col items-start">
                  <h2 className="text-sm font-bold font-mono tracking-widest text-slate-400 dark:text-slate-500 uppercase px-1">
                    {groupText(group.name, group.shortName).name}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                    {groupTools.map(renderToolCard)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Trust & Local Architecture Badge */}
        <div className="p-6 md:p-8 rounded-2xl bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-center">
          <div className="p-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full shrink-0">
            <Cpu className="w-8 h-8" />
          </div>
          <div className="space-y-1 flex-1">
            <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {t('local.title')}
            </h4>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('local.body')}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans transition-colors duration-300 pb-16">
      {/* Universal header banner */}
      <nav className="border-b border-slate-100 dark:border-slate-900 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => setActiveTool('dashboard')}
            id="btn-nav-logo"
            className="flex items-center gap-2 cursor-pointer text-start"
          >
            <div className="w-9 h-9 items-center justify-center bg-emerald-600 rounded-lg flex text-white font-black text-xl shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight shrink-0">
                {t('app.name')}
              </span>
              <p className="text-[9px] font-mono font-bold text-slate-400 uppercase -mt-0.5 tracking-wider">
                {t('app.tagline')}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3">
            {activeTool === 'dashboard' ? (
              <button
                onClick={() => {
                  searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  searchInputRef.current?.focus();
                }}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                title={t('nav.focusSearch')}
              >
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>{t('nav.searchTools')}</span>
                <kbd className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500">
                  /
                </kbd>
              </button>
            ) : (
              <button
                onClick={() => {
                  setActiveTool('dashboard');
                  setTimeout(() => {
                    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    searchInputRef.current?.focus();
                  }, 60);
                }}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                title={t('nav.backToSearch')}
              >
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <span>{t('nav.searchTools')}</span>
              </button>
            )}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
              title={t('nav.language')}
              aria-label={t('nav.language')}
              id="btn-language"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{LANGUAGES.find((l) => l.id !== lang)!.label}</span>
            </button>
            <ThemeSwitcher
              currentMode={themeMode}
              onChange={setThemeMode}
              labels={{ light: t('theme.light'), system: t('theme.system'), dark: t('theme.dark') }}
            />
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 md:pt-12">
        <React.Suspense fallback={
          <div className="flex flex-col items-center justify-center p-12 text-center my-12" role="status" aria-live="polite">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-500 font-medium dark:text-slate-400">{t('loading.tool')}</p>
          </div>
        }>
          {renderActiveTool()}
        </React.Suspense>
      </main>

      {/* Tool chaining: continue with the last result */}
      <ContinueBar
        activeTool={activeTool}
        toolTitle={(id) => {
          const def = TOOLS.find((tool) => tool.id === id);
          return def ? toolText(id, def).title : id;
        }}
        onContinue={(tool) => {
          setActiveTool(tool);
          window.scrollTo({ top: 0 });
        }}
      />

      {/* Floating Performance Dashboard */}
      <PerformanceDashboard />
    </div>
  );
}
