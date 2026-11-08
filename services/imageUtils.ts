
import { GeoData } from './geoUtils';
import * as pdfjsLib from 'pdfjs-dist';

// Handle PDF.js import quirks (ESM vs CommonJS structure from CDN)
const pdfJs: any = pdfjsLib;
const GlobalWorkerOptions = pdfJs.GlobalWorkerOptions || pdfJs.default?.GlobalWorkerOptions;
const getDocument = pdfJs.getDocument || pdfJs.default?.getDocument;

if (GlobalWorkerOptions) {
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
} else {
    console.warn("PDF.js GlobalWorkerOptions not found");
}

export const imageUtils = {
  // Optimized Compression: Uses WebP for better quality/size ratio
  compressImage: async (file: File, quality: number = 0.5, maxWidth: number = 800): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob && blob.size < file.size) {
                const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                resolve(new File([blob], newName, { type: 'image/webp', lastModified: Date.now() }));
          } else {
                resolve(file);
          }
        }, 'image/webp', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    });
  },

  convertPdfToImages: async (file: File, onProgress?: (current: number, total: number) => void): Promise<File[]> => {
      return new Promise(async (resolve, reject) => {
          try {
              if (!getDocument) throw new Error("PDF.js library not loaded correctly.");
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await getDocument({ data: arrayBuffer }).promise;
              const totalPages = pdf.numPages;
              const images: File[] = [];

              for (let i = 1; i <= totalPages; i++) {
                  const page = await pdf.getPage(i);
                  const viewport = page.getViewport({ scale: 1.5 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  if (context) {
                      await page.render({ canvasContext: context, viewport: viewport }).promise;
                      await new Promise<void>((res) => {
                          canvas.toBlob((blob) => {
                              if (blob) {
                                  const pageNum = String(i).padStart(3, '0');
                                  images.push(new File([blob], `${file.name.replace('.pdf', '')}_P${pageNum}.webp`, { type: 'image/webp' }));
                              }
                              res();
                          }, 'image/webp', 0.6);
                      });
                  }
                  if (onProgress) onProgress(i, totalPages);
              }
              resolve(images);
          } catch (e) { reject(e); }
      });
  },

  // --- UNIFIED DRAWING LOGIC (For Images & Videos) ---
  drawWatermarkOnCanvas: (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      geoData: GeoData, 
      projectName: string, 
      projectLocation: string, 
      comment?: string
  ) => {
      // 1. Dimensions: 10% of Width strictly
      const ribbonHeight = Math.round(width * 0.10);
      const fontSize = Math.round(ribbonHeight * 0.35); 
      const fontFace = 'Tajawal, Arial, sans-serif';
      const padding = Math.round(ribbonHeight * 0.15);

      // 2. Prepare Text
      const timestamp = `📅 ${geoData.timestamp}`;
      const weather = geoData.temperature ? `🌡️ ${geoData.temperature}°C ${geoData.weatherDesc ? `| ${geoData.weatherDesc}` : ''}` : ''; 
      const projectText = `🏗️ ${projectName}`;
      const addressText = `📍 ${projectLocation || geoData.address}`;

      // 3. Draw Bottom Ribbon (OVERLAY with 50% Transparency)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; // Slate-900 @ 50%
      ctx.fillRect(0, height - ribbonHeight, width, ribbonHeight);

      // Text Settings
      ctx.textBaseline = 'middle'; 
      ctx.shadowColor = "black";
      ctx.shadowBlur = 2;
      ctx.font = `bold ${fontSize}px ${fontFace}`;

      // Calculate Lines Y Positions
      const centerY = height - (ribbonHeight / 2);
      const lineSpacing = fontSize * 1.3;
      const line1Y = centerY - (lineSpacing / 2);
      const line2Y = centerY + (lineSpacing / 2);

      // --- DYNAMIC SCALING TO PREVENT OVERLAP ---
      // Right Block (Project Info)
      ctx.font = `bold ${fontSize}px ${fontFace}`;
      const projW = ctx.measureText(projectText).width;
      ctx.font = `${fontSize * 0.85}px ${fontFace}`;
      const addrW = ctx.measureText(addressText).width;
      const rightBlockWidth = Math.max(projW, addrW);

      // Left Block (Meta Info)
      ctx.font = `bold ${fontSize * 0.70}px ${fontFace}`;
      const timeW = ctx.measureText(timestamp).width;
      const weathW = ctx.measureText(weather).width;
      const leftBlockWidth = Math.max(timeW, weathW);

      // Check collision
      const availableWidth = width - (padding * 3); // Padding left, right, center
      const neededWidth = rightBlockWidth + leftBlockWidth;
      
      let scaleFactor = 1;
      if (neededWidth > availableWidth) {
          scaleFactor = availableWidth / neededWidth;
      }

      const safeFontSize = Math.floor(fontSize * scaleFactor);
      
      // Draw Right Side
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      
      ctx.font = `bold ${safeFontSize}px ${fontFace}`;
      ctx.fillText(projectText, width - padding, line1Y);
      
      ctx.font = `${safeFontSize * 0.85}px ${fontFace}`;
      ctx.fillStyle = '#cbd5e1'; 
      ctx.fillText(addressText, width - padding, line2Y);

      // Draw Left Side
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      
      // Use smaller font for date
      ctx.font = `bold ${safeFontSize * 0.70}px ${fontFace}`;
      ctx.fillText(timestamp, padding, line1Y);

      if (weather) {
          // Weather info (Temperature + Description)
          ctx.font = `bold ${safeFontSize * 0.80}px ${fontFace}`;
          ctx.fillStyle = '#fbbf24'; // Amber
          ctx.fillText(weather, padding, line2Y);
      }

      // 4. Draw Top Ribbon (Comment) - Only if exists
      if (comment && comment.trim() !== '') {
          const topRibbonHeight = Math.round(ribbonHeight * 0.6); // Slightly smaller than bottom
          
          ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
          ctx.fillRect(0, 0, width, topRibbonHeight);

          let topFontSize = Math.floor(topRibbonHeight * 0.6); 
          ctx.font = `bold ${topFontSize}px ${fontFace}`;
          
          const commentW = ctx.measureText(comment).width;
          const maxCommentW = width - (padding * 2);

          if (commentW > maxCommentW) {
              const cScale = maxCommentW / commentW;
              topFontSize = Math.floor(topFontSize * cScale);
          }

          ctx.font = `bold ${topFontSize}px ${fontFace}`;
          ctx.fillStyle = '#fbbf24'; // Amber text
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(comment, width / 2, topRibbonHeight / 2);
      }
  },

  // --- MAIN WATERMARK FUNCTION (IMAGE) ---
  addWatermark: async (file: File, geoData: GeoData, projectName: string, projectLocation: string, comment?: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("Canvas context failed")); return; }

        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        
        // 1. Draw Image
        ctx.drawImage(img, 0, 0, width, height);

        // 2. Draw Unified Watermark
        imageUtils.drawWatermarkOnCanvas(ctx, width, height, geoData, projectName, projectLocation, comment);

        canvas.toBlob((blob) => {
          if (blob) {
            const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
            resolve(new File([blob], newName, { type: 'image/webp', lastModified: Date.now() }));
          } else {
            reject(new Error("Blob creation failed"));
          }
        }, 'image/webp', 0.85);
      };
      img.onerror = reject;
    });
  },

  // --- VIDEO WATERMARK (VIDEO) ---
  addVideoWatermark: async (file: File, geoData: GeoData, projectName: string, projectLocation: string, onProgress?: (p: number) => void, comment?: string): Promise<File> => {
      return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          
          // CRITICAL: Append video to DOM (hidden) to force browser to render frames for capture
          video.style.position = 'fixed';
          video.style.top = '0';
          video.style.left = '0';
          video.style.width = '1px';
          video.style.height = '1px';
          video.style.opacity = '0';
          video.style.zIndex = '-100';
          video.style.pointerEvents = 'none';
          document.body.appendChild(video);

          // Ensure valid MIME type for Blob
          let videoFile = file;
          if (!file.type) {
              const ext = file.name.split('.').pop()?.toLowerCase();
              let type = 'video/mp4';
              if (ext === 'webm') type = 'video/webm';
              else if (ext === 'mov') type = 'video/quicktime';
              else if (ext === 'avi') type = 'video/x-msvideo';
              videoFile = new File([file], file.name, { type });
          }

          video.src = URL.createObjectURL(videoFile);
          video.crossOrigin = "anonymous";
          
          // Audio & Playback Settings
          // MUST be unmuted to capture audio track, but we don't connect to speakers.
          video.muted = false; 
          video.volume = 1.0; 
          video.playsInline = true; 
          video.preload = 'auto';

          // Audio Context variables
          let audioCtx: AudioContext | null = null;
          let sourceNode: MediaElementAudioSourceNode | null = null;
          let destNode: MediaStreamAudioDestinationNode | null = null;
          let recorder: MediaRecorder | null = null;
          let animationFrameId: number;

          const cleanup = () => {
              if (animationFrameId) cancelAnimationFrame(animationFrameId);
              if (video.src) URL.revokeObjectURL(video.src);
              if (video.parentNode) video.parentNode.removeChild(video);
              if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
          };

          // Wait until video is ready
          video.oncanplaythrough = async () => {
              video.oncanplaythrough = null; // Prevent re-trigger

              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              const MAX_DIMENSION = 1280; 
              let width = video.videoWidth;
              let height = video.videoHeight;

              // Resize Logic
              if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                  const ratio = width / height;
                  if (width > height) { width = MAX_DIMENSION; height = Math.round(MAX_DIMENSION / ratio); }
                  else { height = MAX_DIMENSION; width = Math.round(MAX_DIMENSION * ratio); }
              }

              canvas.width = width;
              canvas.height = height;

              if (!ctx) { cleanup(); reject(new Error("Canvas failed")); return; }

              // --- AUDIO CAPTURE SETUP ---
              try {
                  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                  if (AudioContextClass) {
                      audioCtx = new AudioContextClass();
                      // Important: Resume context (browsers suspend it by default)
                      if (audioCtx.state === 'suspended') {
                          await audioCtx.resume();
                      }
                      
                      destNode = audioCtx.createMediaStreamDestination();
                      sourceNode = audioCtx.createMediaElementSource(video);
                      
                      // Connect Video Source -> Stream Destination
                      // DO NOT connect to audioCtx.destination (Speakers) to avoid echo/feedback
                      sourceNode.connect(destNode);
                  }
              } catch (e) {
                  console.warn("Audio Context setup failed", e);
              }

              // Combine Canvas Video + Captured Audio
              const canvasStream = canvas.captureStream(30); // 30 FPS
              if (destNode && destNode.stream.getAudioTracks().length > 0) {
                  const audioTrack = destNode.stream.getAudioTracks()[0];
                  canvasStream.addTrack(audioTrack);
              }

              // Setup Recorder
              let mimeType = 'video/webm;codecs=vp9';
              if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';
              
              try { 
                  // High bitrate for clarity
                  recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 4000000 }); 
              } catch (e) { 
                  recorder = new MediaRecorder(canvasStream); 
              }

              const chunks: Blob[] = [];
              recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
              recorder.onstop = () => {
                  const ext = mimeType.includes('mp4') ? '.mp4' : '.webm';
                  const finalBlob = new Blob(chunks, { type: mimeType });
                  resolve(new File([finalBlob], file.name.replace(/\.[^/.]+$/, "") + "_geo" + ext, { type: mimeType }));
                  cleanup();
              };

              // --- RENDER LOOP ---
              const drawFrame = () => {
                  if (video.ended || video.paused) {
                      if (recorder && recorder.state === 'recording' && video.ended) {
                          recorder.stop();
                          return;
                      }
                  }

                  // 1. Draw Video Frame
                  ctx.drawImage(video, 0, 0, width, height);
                  
                  // 2. Draw Watermark
                  imageUtils.drawWatermarkOnCanvas(ctx, width, height, geoData, projectName, projectLocation, comment);

                  // 3. SMART START: Only start recorder when video actually moves
                  // This fixes the "Frozen First 5 Seconds" issue
                  if (recorder && recorder.state === 'inactive' && video.currentTime > 0) {
                      recorder.start();
                  }

                  if (onProgress) onProgress(Math.round((video.currentTime / video.duration) * 100));
                  
                  animationFrameId = requestAnimationFrame(drawFrame);
              };

              // --- START SEQUENCE ---
              try {
                  await video.play();
                  drawFrame(); 
              } catch (e) {
                  // Fallback: Muted start if autoplay blocked (shouldn't happen with user interaction but safe to have)
                  console.warn("Autoplay blocked, trying muted start", e);
                  video.muted = true; // Audio will be lost here, but video saves
                  await video.play();
                  drawFrame();
              }
          };
          
          video.onerror = () => {
              const err = video.error;
              const msg = err ? `Code: ${err.code}, Msg: ${err.message}` : "Unknown";
              cleanup();
              reject(new Error(`Video load failed: ${msg}`));
          };
      });
  },

  exportSlidesAsImages: async (containerClass: string, prefix: string) => {
      // @ts-ignore
      if (!window.html2canvas) { alert("Library missing"); return; }
      const slides = document.querySelectorAll(`.${containerClass} .slide-card`);
      if (slides.length === 0) return;
      const exportContainer = document.createElement('div');
      exportContainer.style.cssText = "position:fixed;top:0;left:0;z-index:-9999;opacity:0;";
      document.body.appendChild(exportContainer);
      try {
          for (let i = 0; i < slides.length; i++) {
              const cloned = slides[i].cloneNode(true) as HTMLElement;
              cloned.style.cssText = "width:1080px;height:auto;padding:80px;border-radius:40px;font-size:1.5rem;background:white;display:flex;flex-direction:column;justify-content:center;";
              exportContainer.innerHTML = ''; exportContainer.appendChild(cloned);
              await new Promise(r => setTimeout(r, 50));
              // @ts-ignore
              const canvas = await window.html2canvas(cloned, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
              const link = document.createElement('a');
              link.href = canvas.toDataURL('image/png');
              link.download = `${prefix}_${i + 1}.png`;
              link.click();
          }
      } finally { document.body.removeChild(exportContainer); }
  }
};
