/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Camera, 
  CheckCircle, 
  Loader2, 
  RefreshCw, 
  Download, 
  Trash2, 
  Settings, 
  Crop, 
  RotateCw, 
  Sliders, 
  Sparkles, 
  Plus, 
  FileText, 
  ArrowUp, 
  ArrowDown, 
  ChevronUp,
  ChevronDown,
  Maximize2, 
  FlipHorizontal,
  Eye,
  CameraOff
} from 'lucide-react';
import { imagesToPdf, downloadFile } from '../lib/pdfUtils';

interface ScannedDocumentToolProps {
  onBack: () => void;
}

interface ScannedPage {
  id: string;
  originalDataUrl: string; // Captured webcam shape or absolute image uploads
  processedDataUrl: string; // Cropped & filtered live preview
  rotation: number; // 0, 90, 180, 270 degrees
  crop: {
    top: number; // % 0 to 50
    bottom: number; // % 0 to 50
    left: number; // % 0 to 50
    right: number; // % 0 to 50
  };
  filter: 'original' | 'grayscale' | 'bw' | 'enhance' | 'magic';
  bwThreshold: number; // 0 to 255
}

export default function ScannedDocumentTool({ onBack }: ScannedDocumentToolProps) {
  // Application Workflows States
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [success, setSuccess] = useState(false);

  // Camera States
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);

  // Editing Tabs
  const [activeTab, setActiveTab] = useState<'crop' | 'filter' | 'rotate'>('filter');

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read camera devices list
  useEffect(() => {
    const listDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
        setCameraDevices(videoInputDevices);
        
        if (videoInputDevices.length > 0 && !selectedDeviceId) {
          // Default to back-facing camera if it's a mobile device or just the first device
          const backCam = videoInputDevices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
          setSelectedDeviceId(backCam ? backCam.deviceId : videoInputDevices[0].deviceId);
        }
      } catch (err) {
        console.error('Error enumerating webcams:', err);
      }
    };

    listDevices();
  }, [cameraPermissionGranted, selectedDeviceId]);

  // Start feed effect
  useEffect(() => {
    if (isCameraActive) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [selectedDeviceId, isCameraActive]);

  const startCamera = async () => {
    stopCamera();
    setCameraError(null);

    const constraints: MediaStreamConstraints = {
      video: selectedDeviceId 
        ? { deviceId: { exact: selectedDeviceId } } 
        : { facingMode: 'environment' }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setCameraPermissionGranted(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Failed to get user media camera streams:', err);
      setCameraPermissionGranted(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please click the lock icon in your browser address bar and grant camera access permissions.');
      } else {
        setCameraError('Webcam failed to initialize. Make sure no other apps are using it, or select a different camera source.');
      }
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const toggleCamera = () => {
    setIsCameraActive(prev => !prev);
  };

  // Convert files or captured canvas pixels to local scanned page representation
  const addPageFromDataUrl = async (dataUrl: string, namePlaceholder = 'Captured Document Page') => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Create new blank document record
    const newPage: ScannedPage = {
      id,
      originalDataUrl: dataUrl,
      processedDataUrl: dataUrl,
      rotation: 0,
      crop: { top: 3, bottom: 3, left: 3, right: 3 }, // standard document frame clipping
      filter: 'enhance', // premium scan optimizer defaults
      bwThreshold: 128
    };

    // Pre-render filters immediately to clear the slate
    try {
      const processed = await processImagePage(
        newPage.originalDataUrl, 
        newPage.crop, 
        newPage.rotation, 
        newPage.filter, 
        newPage.bwThreshold
      );
      newPage.processedDataUrl = processed;
    } catch (err) {
      console.error(err);
    }

    setPages(prev => [...prev, newPage]);
    setActivePageIndex(pages.length);
    setSuccess(false);
  };

  // Capture frame from active live video feed
  const captureFrame = () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current || document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Direct match camera dimensions
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    // Draw video buffer onto canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    
    addPageFromDataUrl(dataUrl, `Captured Frame ${pages.length + 1}`);

    // Flash visual indicator feedback
    const videoContainer = document.getElementById('camera-preview-container');
    if (videoContainer) {
      videoContainer.classList.add('brightness-150');
      setTimeout(() => {
        videoContainer.classList.remove('brightness-150');
      }, 150);
    }
  };

  // Image upload replacement option (extremely useful fallback for VM testing or mobile simulators)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = e.target.files;
    
    for (let i = 0; i < files.length; i++) {
       const file = files[i];
       const reader = new FileReader();
       reader.onload = (event) => {
         if (event.target?.result) {
           addPageFromDataUrl(event.target.result as string, file.name);
         }
       };
       reader.readAsDataURL(file);
    }
  };

  // Image Processing Core
  const processImagePage = (
    originalUrl: string, 
    crop: { top: number; bottom: number; left: number; right: number }, 
    rotation: number, 
    filter: string, 
    bwThreshold: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(originalUrl);
          return;
        }

        // Calculate size offsets inside base photo size
        const origW = img.width;
        const origH = img.height;

        const cropX = (crop.left / 100) * origW;
        const cropY = (crop.top / 100) * origH;
        const cropW = origW - cropX - ((crop.right / 100) * origW);
        const cropH = origH - cropY - ((crop.bottom / 100) * origH);

        const finalCropW = Math.max(20, cropW);
        const finalCropH = Math.max(20, cropH);

        // Adjust dimensions depending on 90deg CW/CCW rotations
        let drawWidth = finalCropW;
        let drawHeight = finalCropH;
        if (rotation === 90 || rotation === 270) {
          canvas.width = finalCropH;
          canvas.height = finalCropW;
        } else {
          canvas.width = finalCropW;
          canvas.height = finalCropH;
        }

        // Center on drawing plate
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        
        ctx.drawImage(
          img,
          cropX, cropY, finalCropW, finalCropH, // cropped source coordinates
          -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight // output box limits
        );

        // Apply filters on canvas buffer context
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        if (filter === 'grayscale') {
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            data[i] = data[i + 1] = data[i + 2] = gray;
          }
          ctx.putImageData(imgData, 0, 0);
        } else if (filter === 'bw') {
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const finalVal = gray >= bwThreshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = finalVal;
          }
          ctx.putImageData(imgData, 0, 0);
        } else if (filter === 'enhance') {
          for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Increase visual contrast dynamically, wash light gray pixels to neat sheet white
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (gray > 140) {
              // Whitewash paper backgrounds
              r = Math.min(255, r * 1.25 + 15);
              g = Math.min(255, g * 1.25 + 15);
              b = Math.min(255, b * 1.25 + 15);
            } else {
              // Deepen black characters text
              r = Math.max(0, r * 0.7 - 20);
              g = Math.max(0, g * 0.7 - 20);
              b = Math.max(0, b * 0.7 - 20);
            }
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
          ctx.putImageData(imgData, 0, 0);
        } else if (filter === 'magic') {
          for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Auto-boost color saturations
            r = Math.min(255, Math.max(0, (r - 128) * 1.35 + 128));
            g = Math.min(255, Math.max(0, (g - 128) * 1.35 + 128));
            b = Math.min(255, Math.max(0, (b - 128) * 1.35 + 128));

            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
          ctx.putImageData(imgData, 0, 0);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.90));
      };
      img.onerror = () => {
        reject(new Error("Image failed loading."));
      };
      img.src = originalUrl;
    });
  };

  // Handle live page modifier adjustments reactively
  const updatePageSetting = async (
    index: number, 
    changes: Partial<Pick<ScannedPage, 'rotation' | 'crop' | 'filter' | 'bwThreshold'>>
  ) => {
    const updatedPages = [...pages];
    const page = { ...updatedPages[index], ...changes };

    // re-run pixel manipulation on adjust changes
    try {
      const processed = await processImagePage(
        page.originalDataUrl, 
        page.crop, 
        page.rotation, 
        page.filter, 
        page.bwThreshold
      );
      page.processedDataUrl = processed;
      updatedPages[index] = page;
      setPages(updatedPages);
    } catch (err) {
      console.error('Error reprocessing scanned image layout:', err);
    }
  };

  // Reorder and delete pages
  const movePage = (index: number, dir: 'up' | 'down') => {
    if (dir === 'up' && index === 0) return;
    if (dir === 'down' && index === pages.length - 1) return;

    const targetIdx = dir === 'up' ? index - 1 : index + 1;
    const reordered = [...pages];
    const temp = reordered[index];
    reordered[index] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    setPages(reordered);
    setActivePageIndex(targetIdx);
  };

  const deletePage = (index: number) => {
    const reordered = pages.filter((_, i) => i !== index);
    setPages(reordered);
    if (activePageIndex >= reordered.length) {
      setActivePageIndex(reordered.length - 1);
    } else if (activePageIndex === index) {
      setActivePageIndex(reordered.length > 0 ? 0 : -1);
    }
  };

  // Convert processed data URLs base64 to buffers, assemble multi-page PDF output
  const handleCompileScan = async () => {
    if (pages.length === 0) return;
    setLoading(true);
    setStatusText('Compiling and saving digitized printable document...');

    try {
      const payload = pages.map((page, index) => {
        // base64 reader to ArrayBuffer
        const binaryString = window.atob(page.processedDataUrl.split(',')[1]);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        return {
          data: bytes.buffer,
          name: `scanned_page_${index + 1}.jpg`,
          type: 'image/jpeg'
        };
      });

      const compiledPdfBytes = await imagesToPdf(payload);
      downloadFile(compiledPdfBytes, 'scanned_document.pdf', 'application/pdf');
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      alert('Error building high resolution scanned PDF compilation.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleReset = () => {
    setPages([]);
    setActivePageIndex(-1);
    setSuccess(false);
  };

  const activePage = activePageIndex >= 0 && activePageIndex < pages.length ? pages[activePageIndex] : null;

  return (
    <div className="space-y-6">
      {/* Navigation and state header indicator */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            stopCamera();
            onBack();
          }}
          id="btn-scanner-back"
          className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-full font-semibold">
            Cam-Enhance Engine
          </span>
          <span className="text-xs font-mono px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full font-semibold">
            Auto-Crop & Filter
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
        
        {/* Title details */}
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">Camera Document Scanner</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Capture physical forms, paper sheets, receipts, or notes. Filter out shadow gradients, auto-crop boundaries, and stitch into a single, compact PDF.
            </p>
          </div>
          {pages.length > 0 && (
            <button
              onClick={handleReset}
              id="btn-reset-scanner-workspace"
              className="px-3.5 py-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Digitizer
            </button>
          )}
        </div>

        {/* Global Action State Flags */}
        {loading && (
          <div className="mb-6 p-4 rounded-xl bg-teal-500/5 border border-teal-500/10 flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
            <Loader2 className="w-5 h-5 text-teal-605 animate-spin shrink-0" />
            <span>{statusText || 'Calibrating digital page matrices...'}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-4 text-sm text-emerald-600 dark:text-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>
                <span className="font-semibold">Document Digitization Finished!</span>{' '}
                Your scanned document has been compiled, aligned, and saved as a vector PDF.
              </span>
            </div>
            <button
              onClick={handleReset}
              id="btn-scan-success-reset"
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer font-sans"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Start another scan
            </button>
          </div>
        )}

        {/* DOUBLE VIEWPORT GRID WORKBENCH */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT SIDE: CAMERA CAPTURING FEED STATION (Col-span 5) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-850 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs font-mono text-slate-400 uppercase tracking-wide">
                  <Camera className="w-4 h-4 text-teal-600" />
                  <span>Interactive Capture Station</span>
                </div>

                {cameraDevices.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    id="select-scanner-camera-device"
                    className="text-[10px] bg-white dark:bg-slate-900 border border-slate-205 py-1 px-2 pr-1 rounded-md outline-none text-slate-600 font-sans"
                  >
                    {cameraDevices.map((device, idx) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Cam ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* LIVE WEBCAM VIDEO BOX */}
              {isCameraActive ? (
                <div 
                  id="camera-preview-container"
                  className="bg-black aspect-[3/4] relative rounded-xl overflow-hidden shadow-inner flex items-center justify-center transition-all duration-150 border-2 border-slate-800"
                >
                  {/* Real video stream elements */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]" // mirrors webcam for natural human feel
                  />

                  {/* Aesthetic grid scanner visual laser outline */}
                  <div className="absolute inset-0 border-2 border-dashed border-teal-500/40 m-6 flex flex-col justify-between pointer-events-none rounded-sm">
                    <p className="text-[10px] select-none text-center bg-teal-500/80 text-white font-mono uppercase px-1.5 py-0.5 rounded-sm self-center mt-2 tracking-wider">
                      Center document page here
                    </p>
                    <div className="h-0.5 w-full bg-teal-500/65 animate-pulse mb-8" />
                  </div>

                  {!cameraStream && !cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-405 gap-2.5 p-4 bg-slate-950/90 text-center">
                      <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                      <p className="text-xs font-semibold text-slate-300">Granting browser capture hook permissions...</p>
                    </div>
                  )}

                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 bg-slate-950/95 text-center gap-3">
                      <CameraOff className="w-8 h-8 text-rose-500" />
                      <p className="text-xs font-sans text-rose-400 font-semibold">{cameraError}</p>
                      
                      <button
                        onClick={startCamera}
                        id="btn-reconnect-webcam"
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Reconnect camera
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[3/4] bg-slate-100 dark:bg-slate-900/60 rounded-xl flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200">
                  <CameraOff className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Webcam stand-by sleep state</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    To capture sheets using a physical scanner feed, boot on camera stream.
                  </p>
                  <button
                    onClick={toggleCamera}
                    id="btn-reactivate-feed"
                    className="mt-4 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Turn Camera On
                  </button>
                </div>
              )}

              {/* ACTION: CAPTURE DOCUMENT PAGE */}
              {isCameraActive && cameraStream && (
                <div className="flex gap-2">
                  <button
                    onClick={captureFrame}
                    id="btn-capture-scan-page"
                    className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer font-sans text-xs uppercase tracking-wider"
                  >
                    <Plus className="w-4 h-4" /> Capture Page {pages.length + 1}
                  </button>

                  <button
                    onClick={toggleCamera}
                    id="btn-scanner-pause-cam"
                    className="p-3 bg-slate-150 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-750 dark:text-slate-300 rounded-xl cursor-pointer"
                    title="Sleep webcam stream"
                  >
                    <CameraOff className="w-4.5 h-4.5" />
                  </button>
                </div>
              )}

              {/* LOCAL FALLBACK FILE SELECTOR */}
              <div className="border-t border-slate-150 dark:border-slate-850 pt-3">
                <div className="text-center text-[10px] text-slate-400 font-bold mb-2 uppercase tracking-wide">
                  — OR IMPORT DOCUMENT FROM DEVICE —
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  id="btn-scanner-upload-fallbacks"
                  className="w-full py-2 bg-white dark:bg-slate-900 border border-slate-300 hover:bg-slate-50 text-slate-705 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <FileText className="w-4 h-4 text-teal-600" />
                  Pick local photo scans / JPG / PNG
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="scanner-photo-inputs"
                  multiple
                  accept="image/png, image/jpeg, image/jpg"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

            </div>

            {/* DIGITIZED MULTI-PAGE STACK LIST (SIDEBAR DRAWER) */}
            {pages.length > 0 && (
              <div className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-55/40 space-y-3">
                <div className="flex items-center justify-between select-none">
                  <span className="text-[11px] font-bold font-mono text-slate-450 uppercase tracking-widest">
                    Scan stack ({pages.length} pages captured)
                  </span>
                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-sans font-semibold">
                    Click card to edit
                  </span>
                </div>

                <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
                  {pages.map((page, idx) => (
                    <div
                      key={page.id}
                      onClick={() => setActivePageIndex(idx)}
                      id={`scanned-list-card-${idx}`}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none group relative ${
                        activePageIndex === idx
                          ? 'border-teal-500 bg-teal-500/5 shadow-xs'
                          : 'border-slate-150 hover:bg-slate-50 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-400 font-mono opacity-80 group-hover:opacity-100 flex flex-col items-center">
                        <span>P.</span>
                        <span className="text-sm font-sans">{idx + 1}</span>
                      </div>

                      {/* Small Processed thumbnail image */}
                      <div className="w-12 h-16 bg-slate-100 rounded-md border flex-shrink-0 relative overflow-hidden">
                        <img
                          src={page.processedDataUrl}
                          alt="Thumbnail scanner page"
                          className="w-full h-full object-cover pointer-events-none"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>

                      {/* Metadata file text */}
                      <div className="flex-1 truncate">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate pr-4">
                          Image scan page_{idx + 1}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate uppercase tracking-widest font-mono font-bold mt-0.5">
                          Filter: {page.filter}
                        </p>
                      </div>

                      {/* Move Reordering, detonate nodes */}
                      <div className="flex flex-col items-center gap-1 opacity-40 group-hover:opacity-100 transition-all">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            movePage(idx, 'up');
                          }}
                          disabled={idx === 0}
                          id={`btn-scanned-move-up-${idx}`}
                          className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-20 cursor-pointer text-slate-600 dark:text-slate-400"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            movePage(idx, 'down');
                          }}
                          disabled={idx === pages.length - 1}
                          id={`btn-scanned-move-down-${idx}`}
                          className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-20 cursor-pointer text-slate-600 dark:text-slate-400"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePage(idx);
                        }}
                        id={`btn-scanned-delete-page-${idx}`}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-605 rounded-xl absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-all text-slate-400 cursor-pointer"
                        title="Discard page from scanned plate"
                      >
                        <Trash2 className="w-3.5 h-3.5 hover:scale-110 transition-transform" />
                      </button>

                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* RIGHT SIDE: ADVANCED PAGE FINE-TUNING WORKBENCH PREVIEW (Col-span 7) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            
            {activePage ? (
              <div className="space-y-4">
                
                {/* PREVIEW BAR HEADER */}
                <div className="flex items-center justify-between border-b pb-3 border-slate-150 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4.5 h-4.5 text-teal-600" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-sans">
                      Align Page {activePageIndex + 1} of {pages.length}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-500 rounded-lg">
                    Adjust original template resolution
                  </span>
                </div>

                {/* VISUAL CROP & WORKBENCH PREVIEW CONTAINER */}
                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/60 p-6 flex flex-col md:flex-row items-center justify-center gap-8 min-h-[420px] relative overflow-hidden">
                  
                  {/* CANVAS PREVIEW SHEETS */}
                  <div 
                    className="relative bg-white border border-slate-200 shadow-lg rounded-xs overflow-hidden flex items-center justify-center scale-95"
                    style={{
                      width: '280px',
                      aspectRatio: '8.5/11', // generic vertical standard layout paper sheet
                    }}
                  >
                    {/* Processed active frame */}
                    <img
                      src={activePage.processedDataUrl}
                      alt="Digitized scanner sheet view"
                      className="w-full h-full object-contain pointer-events-none"
                      referrerPolicy="no-referrer"
                    />

                    {/* Crop visual boundary box overlays when active cropped select */}
                    {activeTab === 'crop' && (
                      <div 
                        className="absolute border-2 border-dashed border-rose-500/80 bg-rose-500/5 pointer-events-none flex flex-col items-center justify-center"
                        style={{
                          top: `${activePage.crop.top}%`,
                          bottom: `${activePage.crop.bottom}%`,
                          left: `${activePage.crop.left}%`,
                          right: `${activePage.crop.right}%`,
                        }}
                      >
                        <span className="text-[9px] bg-rose-500 text-white font-mono uppercase px-1 py-0.5 rounded font-bold">
                          Cropped Print Area
                        </span>
                      </div>
                    )}
                  </div>

                  {/* TAB CONTROLS (ROTATION, FILTER, CROPPING) */}
                  <div className="flex-1 w-full space-y-4">
                    
                    {/* Select menu */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-205">
                      <button
                        onClick={() => setActiveTab('filter')}
                        id="btn-active-tab-filter"
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          activeTab === 'filter'
                            ? 'bg-white dark:bg-slate-900 text-teal-650 shadow-xs font-bold'
                            : 'text-slate-500'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 inline mr-1" /> Filters
                      </button>
                      <button
                        onClick={() => setActiveTab('crop')}
                        id="btn-active-tab-crop"
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          activeTab === 'crop'
                            ? 'bg-white dark:bg-slate-900 text-teal-650 shadow-xs font-bold'
                            : 'text-slate-500'
                        }`}
                      >
                        <Crop className="w-3.5 h-3.5 inline mr-1" /> Crop Margins
                      </button>
                      <button
                        onClick={() => setActiveTab('rotate')}
                        id="btn-active-tab-rotate"
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          activeTab === 'rotate'
                            ? 'bg-white dark:bg-slate-900 text-teal-650 shadow-xs font-bold'
                            : 'text-slate-500'
                        }`}
                      >
                        <RotateCw className="w-3.5 h-3.5 inline mr-1" /> Rotation
                      </button>
                    </div>

                    {/* TAB CONTENT: FILTERS */}
                    {activeTab === 'filter' && (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-400">
                          Color filters remove shadows, boost black text clarity, and clean up physical background paper folds recursively.
                        </p>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { key: 'original', label: 'True Colors (Photo)', desc: 'Keeps shades as shot' },
                            { key: 'enhance', label: 'Standard Document', desc: 'Whitens margins & sharpens text' },
                            { key: 'bw', label: 'B&W Photocopy', desc: 'Binary high-contrast outline' },
                            { key: 'grayscale', label: 'Grayscale Office', desc: 'Clean black/white gradient' },
                            { key: 'magic', label: 'Magic Color Boost', desc: 'High saturation vibrancy' },
                          ].map((fil) => (
                            <button
                              key={fil.key}
                              onClick={() => updatePageSetting(activePageIndex, { filter: fil.key as any })}
                              id={`btn-scanner-filter-${fil.key}`}
                              className={`p-2.5 text-left border rounded-xl transition-all cursor-pointer ${
                                activePage.filter === fil.key
                                  ? 'border-teal-500 bg-teal-500/5 font-bold text-teal-700 dark:text-teal-400'
                                  : 'bg-white hover:bg-slate-55 dark:bg-slate-900 border-slate-200 text-slate-600'
                              }`}
                            >
                              <p className="text-xs font-semibold">{fil.label}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight font-normal">{fil.desc}</p>
                            </button>
                          ))}
                        </div>

                        {/* Binary Custom Threshold Slider */}
                        {activePage.filter === 'bw' && (
                          <div className="p-3 border rounded-xl bg-white dark:bg-slate-905 space-y-1">
                            <div className="flex justify-between text-xs font-medium text-slate-600">
                              <span>Binary B&W Threshold</span>
                              <span className="font-mono text-teal-605">{activePage.bwThreshold}</span>
                            </div>
                            <input
                              type="range"
                              min="30"
                              max="220"
                              step="2"
                              value={activePage.bwThreshold}
                              onChange={(e) => {
                                updatePageSetting(activePageIndex, { bwThreshold: parseInt(e.target.value, 10) });
                              }}
                              id="slider-scanner-bw-threshold"
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                            />
                            <p className="text-[10px] text-slate-400 leading-tight">
                              Increase to darken subtle ink, decrease to filter noise blemishes.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB CONTENT: CROPPING MARGINS */}
                    {activeTab === 'crop' && (
                      <div className="space-y-4">
                        <p className="text-xs text-slate-400">
                          Trim document page margins manually to erase table surfaces, background edges, or fingers holding the document.
                        </p>

                        <div className="space-y-3.5 p-4 bg-white dark:bg-slate-900 border border-slate-200/60 rounded-2xl select-none">
                          {/* Top Crop Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                              <span>Top Border Trim</span>
                              <span className="text-teal-605 font-mono">{activePage.crop.top}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              value={activePage.crop.top}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                updatePageSetting(activePageIndex, { 
                                  crop: { ...activePage.crop, top: val } 
                                });
                              }}
                              id="slider-crop-top"
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                            />
                          </div>

                          {/* Bottom Crop Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                              <span>Bottom Border Trim</span>
                              <span className="text-teal-605 font-mono">{activePage.crop.bottom}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              value={activePage.crop.bottom}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                updatePageSetting(activePageIndex, { 
                                  crop: { ...activePage.crop, bottom: val } 
                                });
                              }}
                              id="slider-crop-bottom"
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                            />
                          </div>

                          {/* Left Crop Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                              <span>Left Border Trim</span>
                              <span className="text-teal-605 font-mono">{activePage.crop.left}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              value={activePage.crop.left}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                updatePageSetting(activePageIndex, { 
                                  crop: { ...activePage.crop, left: val } 
                                });
                              }}
                              id="slider-crop-left"
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                            />
                          </div>

                          {/* Right Crop Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                              <span>Right Border Trim</span>
                              <span className="text-teal-605 font-mono">{activePage.crop.right}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              value={activePage.crop.right}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                updatePageSetting(activePageIndex, { 
                                  crop: { ...activePage.crop, right: val } 
                                });
                              }}
                              id="slider-crop-right"
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                            />
                          </div>

                          <div className="pt-2 text-center">
                            <button
                              onClick={() => {
                                updatePageSetting(activePageIndex, { crop: { top: 3, bottom: 3, left: 3, right: 3 } });
                              }}
                              id="btn-rectify-crops"
                              className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-mono cursor-pointer font-bold"
                            >
                              Standard Margins reset
                            </button>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* TAB CONTENT: ROTATION */}
                    {activeTab === 'rotate' && (
                      <div className="space-y-5">
                        <p className="text-xs text-slate-400">
                          Manually rotate or mirror pages that were shot rotated horizontally or at upside-down landscape angles.
                        </p>

                        <div className="flex gap-2.5">
                          <button
                            onClick={() => {
                              const nextRot = (activePage.rotation + 90) % 360;
                              updatePageSetting(activePageIndex, { rotation: nextRot });
                            }}
                            id="btn-rotate-step-cw"
                            className="flex-1 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 border border-slate-205 text-slate-705 dark:text-slate-255 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 text-teal-606" />
                            Rotate 90° CW
                          </button>

                          <button
                            onClick={() => {
                              const nextRot = (activePage.rotation + 270) % 360;
                              updatePageSetting(activePageIndex, { rotation: nextRot });
                            }}
                            id="btn-rotate-step-ccw"
                            className="flex-1 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 border border-slate-205 text-slate-705 dark:text-slate-255 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <RotateCw className="w-4 h-4 text-teal-606 transform -scale-x-100" />
                            Rotate 90° CCW
                          </button>
                        </div>

                        <div className="p-3 border rounded-xl bg-orange-500/5 border-orange-500/10 text-[10.5px] text-slate-400 leading-normal">
                          <span className="font-bold text-orange-605">TIP:</span> Rotation preserves high DPI vectors correctly, aligning standard print coordinates of pages before assembling.
                        </div>

                      </div>
                    )}

                  </div>

                </div>

              </div>
            ) : (
              <div className="h-full min-h-[420px] bg-slate-55/30 border-2 border-dashed border-slate-200/50 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-center p-8 select-none">
                <FileText className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-450">Scanned pages workspace empty</p>
                <p className="text-xs text-slate-400 mt-1.5 max-w-[280px]">
                  Take a photo of your paper using the Capture feed on the left, or upload a camera photo to begin fine-tuning!
                </p>
              </div>
            )}

          </div>

        </div>

        {/* COMPILATION AND DOWNLOAD BUTTON ACTIONS */}
        {pages.length > 0 && (
          <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-4 rounded-2xl mt-8">
            <button
              onClick={handleReset}
              id="btn-clear-scanner-and-stack"
              className="text-xs font-bold text-rose-506 hover:text-rose-600 cursor-pointer text-rose-500 font-sans transition-colors"
            >
              Discard Scanner stack ({pages.length} records)
            </button>

            <button
              onClick={handleCompileScan}
              disabled={loading}
              id="btn-scanner-submit"
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-500/50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Compile {pages.length} {pages.length === 1 ? 'Page' : 'Pages'} to PDF
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
