import { BrowserMultiFormatReader } from '@zxing/browser';
import { CalibrationData, StudentResult, Box, Point } from './types';

// We must declare cv and pdfjsLib since they are loaded via CDN
declare const cv: any;
declare const pdfjsLib: any;

export async function loadPdf(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf;
}

export const PDF_RENDER_SCALE = 3.0;

export const WARPED_W = 2000;
export const WARPED_H = 2800;

export async function renderPdfPageToCanvas(pdf: any, pageNumber: number, scale = PDF_RENDER_SCALE): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  return canvas;
}

export function splitCanvasIfA4(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  // If landscape, we assume it's A4 containing two A5 portrait sheets side-by-side
  if (canvas.width > canvas.height * 1.1) {
    const w = canvas.width / 2;
    const h = canvas.height;
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 0; i < 2; i++) {
      const splitCanvas = document.createElement('canvas');
      splitCanvas.width = w;
      splitCanvas.height = h;
      const ctx = splitCanvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(canvas, i * w, 0, w, h, 0, 0, w, h);
      canvases.push(splitCanvas);
    }
    return canvases;
  }
  return [canvas];
}

export function orderPoints(pts: Point[]) {
  // top-left, top-right, bottom-right, bottom-left
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  let top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  let bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

export function findLargestRect(src: any) {
  let gray = new cv.Mat();
  let blurred = new cv.Mat();
  let edged = new cv.Mat();
  
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edged, 75, 200);
  
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  
  let maxArea = 0;
  let maxContour = null;
  
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > maxArea) {
      let peri = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      
      if (approx.rows === 4) {
        maxArea = area;
        maxContour = approx.clone();
      }
      approx.delete();
    }
  }
  
  gray.delete();
  blurred.delete();
  edged.delete();
  contours.delete();
  hierarchy.delete();
  
  return maxContour;
}

// Mock Master List Database for 500k students (Simulated)
const MOCK_MASTER_LIST: Record<string, any> = {
  "123456": { name: "John Doe", church: "St. Mark", level: "Middle School" },
  "789012": { name: "Jane Smith", church: "St. Mary", level: "High School" },
  "TEST_ID": { name: "Test Student", church: "Test Church", level: "Test Level" }
};

function fetchStudentFromDatabase(id: string) {
  // Query Firestore/Database instantly
  return MOCK_MASTER_LIST[id] || null;
}

export function findCornerAnchors(src: any) {
  let gray = new cv.Mat();
  let thresh = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.threshold(gray, thresh, 100, 255, cv.THRESH_BINARY_INV);
  
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  
  let candidateAnchors: any[] = [];
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = cv.contourArea(cnt);
    let aspectRatio = rect.width / rect.height;
    
    // Anchor squares should be solid black timing marks, roughly square
    if (area > 200 && area < 15000 && aspectRatio > 0.5 && aspectRatio < 2.0) {
      candidateAnchors.push({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        area: area
      });
    }
  }
  
  gray.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();

  if (candidateAnchors.length < 4) return null;

  // Pick the 4 candidates that are closest to the corners of the entire image
  const W = src.cols;
  const H = src.rows;
  
  const corners = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: 0, y: H },
    { x: W, y: H }
  ];
  
  let finalAnchors: any[] = [];
  corners.forEach(c => {
    let best = candidateAnchors[0];
    let minDist = Math.hypot(best.x - c.x, best.y - c.y);
    candidateAnchors.forEach(a => {
      let dist = Math.hypot(a.x - c.x, a.y - c.y);
      if (dist < minDist) {
        minDist = dist;
        best = a;
      }
    });
    finalAnchors.push({x: best.x, y: best.y});
  });
  
  // Return in order: TL, TR, BR, BL
  finalAnchors.sort((a, b) => a.y - b.y);
  let top = finalAnchors.slice(0, 2).sort((a, b) => a.x - b.x);
  let bottom = finalAnchors.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

export async function warpPage(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const srcMat = cv.imread(canvas);
  const warpedMat = new cv.Mat();
  const anchors = findCornerAnchors(srcMat);
  let pts: Point[] = [];

  if (anchors) {
    pts = anchors;
  } else {
    const rectView = findLargestRect(srcMat);
    if (rectView) {
      let rectPts: any[] = [];
      for (let i = 0; i < 4; i++) {
        rectPts.push({ x: rectView.data32S[i * 2], y: rectView.data32S[i * 2 + 1] });
      }
      rectView.delete();
      pts = orderPoints(rectPts);
    }
  }

  if (pts.length === 4) {
    let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pts[0].x, pts[0].y,
      pts[1].x, pts[1].y,
      pts[2].x, pts[2].y,
      pts[3].x, pts[3].y
    ]);
    let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, WARPED_W, 0, WARPED_W, WARPED_H, 0, WARPED_H]);
    let M = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.warpPerspective(srcMat, warpedMat, M, new cv.Size(WARPED_W, WARPED_H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    
    srcPts.delete();
    dstPts.delete();
    M.delete();
    srcMat.delete();
    
    const outCanvas = document.createElement('canvas');
    outCanvas.width = WARPED_W;
    outCanvas.height = WARPED_H;
    cv.imshow(outCanvas, warpedMat);
    warpedMat.delete();
    return outCanvas;
  }

  srcMat.delete();
  warpedMat.delete();
  return canvas; // Return original if detection fails
}

export async function processSinglePage(
  canvas: HTMLCanvasElement, 
  calibration: CalibrationData, 
  answerKey: Record<number, string>,
  questionsCount: number,
  optionsCount: number,
  columnsCount: number
): Promise<StudentResult> {
  let srcMat = cv.imread(canvas);
  let result: StudentResult = {
    id: 'ID_Unknown',
    name: '',
    church: '',
    level: '',
    score: 0,
    status: 'success',
    pageImage: canvas.toDataURL('image/jpeg', 0.5),
    pageWidth: canvas.width,
    pageHeight: canvas.height,
    pageBoundaryPoints: []
  };

  // 1. Boundary Detection & Warp
  const anchors = findCornerAnchors(srcMat);
  let warpedMat = new cv.Mat();
  let warpApplied = false;

  if (anchors) {
    result.pageBoundaryPoints = anchors.map(a => ({ x: a.x, y: a.y }));
    
    let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      anchors[0].x, anchors[0].y,
      anchors[1].x, anchors[1].y,
      anchors[2].x, anchors[2].y,
      anchors[3].x, anchors[3].y
    ]);
    
    let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      WARPED_W, 0,
      WARPED_W, WARPED_H,
      0, WARPED_H
    ]);

    let M = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.warpPerspective(srcMat, warpedMat, M, new cv.Size(WARPED_W, WARPED_H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    
    srcPts.delete();
    dstPts.delete();
    M.delete();
    warpApplied = true;
  } else {
    // Attempt fallback to largest rectangle
    const rect = findLargestRect(srcMat);
    if (rect) {
      let rectPts: any[] = [];
      for (let i = 0; i < 4; i++) {
        rectPts.push({ x: rect.data32S[i * 2], y: rect.data32S[i * 2 + 1] });
      }
      rect.delete();
      const ordered = orderPoints(rectPts);
      result.pageBoundaryPoints = ordered;
      
      let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        ordered[0].x, ordered[0].y,
        ordered[1].x, ordered[1].y,
        ordered[2].x, ordered[2].y,
        ordered[3].x, ordered[3].y
      ]);
      let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, WARPED_W, 0, WARPED_W, WARPED_H, 0, WARPED_H]);
      let M = cv.getPerspectiveTransform(srcPts, dstPts);
      cv.warpPerspective(srcMat, warpedMat, M, new cv.Size(WARPED_W, WARPED_H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
      srcPts.delete();
      dstPts.delete();
      M.delete();
      warpApplied = true;
      result.warning = 'Page Boundary Not Fully Visible (Anchors Missing).';
    } else {
      result.status = 'needs_attention';
      result.errorLog = ['Page Boundary Not Fully Visible. All 4 anchors and paper edges undetected.'];
      srcMat.copyTo(warpedMat);
    }
  }

  // 2. Background Masking & Prepare warped canvas
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = WARPED_W;
  warpedCanvas.height = WARPED_H;
  cv.imshow(warpedCanvas, warpedMat);
  
  const W = WARPED_W;
  const H = WARPED_H;
  
  // From here on, process everything on warpedCanvas
  const ctx = warpedCanvas.getContext('2d', { willReadFrequently: true })!;

  // 3. Barcode Processing on Warped Page
  // To handle upside-down scans, we check both the top and bottom regions of the warped image.
  const codeReader = new BrowserMultiFormatReader();
  let codeData: string | null = null;
  let qrInBottom = false;

  const tryDecodeRegion = async (startY: number, height: number): Promise<string | null> => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = W;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(warpedCanvas, 0, startY, W, height, 0, 0, W, height);
    try {
      const code = await codeReader.decodeFromCanvas(tempCanvas);
      return code.getText();
    } catch (e) {
      // Contrast Enhancement
      let qrImgData = tempCtx.getImageData(0, 0, W, height);
      let qrMat = cv.matFromImageData(qrImgData);
      let gray = new cv.Mat();
      let enhanced = new cv.Mat();
      cv.cvtColor(qrMat, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.equalizeHist(gray, enhanced);
      cv.threshold(enhanced, enhanced, 128, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      cv.imshow(tempCanvas, enhanced);
      qrMat.delete(); gray.delete(); enhanced.delete();
      try {
        const code = await codeReader.decodeFromCanvas(tempCanvas);
        return code.getText();
      } catch (e2) {
        return null;
      }
    }
  };

  // Try Top Region (Upper 35%)
  codeData = await tryDecodeRegion(0, Math.round(H * 0.35));
  
  if (!codeData) {
    // Try Bottom Region (Lower 35%)
    console.log("QR not in top. Checking bottom...");
    codeData = await tryDecodeRegion(H - Math.round(H * 0.35), Math.round(H * 0.35));
    if (codeData) {
      qrInBottom = true;
    }
  }

  if (qrInBottom) {
    console.log("Upside-down page detected. Rotating 180 degrees.");
    cv.rotate(warpedMat, warpedMat, cv.ROTATE_180);
    cv.imshow(warpedCanvas, warpedMat);
    ctx.drawImage(warpedCanvas, 0, 0); // update ctx
  }

  if (codeData) {
    let rawId = codeData.trim();
    try {
      const studentData = JSON.parse(codeData);
      rawId = String(studentData.id || studentData.Student_ID || codeData);
    } catch (e) {
      if (rawId.includes('-')) {
        const parts = rawId.split('-').map(p => p.trim());
        rawId = parts[parts.length - 1] || rawId;
      }
    }
    
    // 5. Absolute Requirement: Populate instantly from the database. No ID_Unknown allowed.
    result.id = rawId;
    const dbStudent = fetchStudentFromDatabase(rawId);
    
    if (dbStudent) {
      result.name = dbStudent.name;
      result.church = dbStudent.church;
      result.level = dbStudent.level;
    } else {
      // Flag as "Unregistered Student" immediately
      result.status = 'needs_attention';
      if (!result.errorLog) result.errorLog = [];
      result.errorLog.push('Identity Failure: Unregistered Student in 500k Master List.');
    }
  } else {
    result.status = 'needs_attention';
    if (!result.errorLog) result.errorLog = [];
    result.errorLog.push('Barcode scanner failed. Please check document alignment.');
    // Fail immediately if barcode is invalid
    result.pageImage = warpedCanvas.toDataURL('image/jpeg', 0.6);
    srcMat.delete();
    warpedMat.delete();
    return result;
  }

  // 4. Advanced Image Pre-processing (Anti-Darkness Logic)
  let gray: any = null;
  let thresh: any = null;
  let blurred: any = null;
  try {
    gray = new cv.Mat();
    cv.cvtColor(warpedMat, gray, cv.COLOR_RGBA2GRAY, 0);
    
    // Sanity Check: If image is near zero mean intensity, adjust exposure
    let mean = cv.mean(gray);
    if (mean[0] < 50) {
      console.warn("Image is too dark! Auto-adjusting exposure and contrast.");
      cv.convertScaleAbs(gray, gray, 2.0, 50); // alpha=2.0 (contrast), beta=50 (brightness)
    }

    // Dynamic Range Correction: Global Histogram Equalization
    cv.equalizeHist(gray, gray);

    // Adaptive Thresholding logic rather than fixed global threshold
    thresh = new cv.Mat();
    cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 10);
    
    // Morphology: Dilation and Erosion
    let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(thresh, thresh, kernel, new cv.Point(-1, -1), 1);
    cv.erode(thresh, thresh, kernel, new cv.Point(-1, -1), 1);
    kernel.delete();

    const threshCanvas = document.createElement('canvas');
    threshCanvas.width = W;
    threshCanvas.height = H;
    cv.imshow(threshCanvas, thresh);
    const binCtx = threshCanvas.getContext('2d', { willReadFrequently: true })!;

    result.anomalies = [];
    let totalScore = 0;

    const options = Array.from({ length: optionsCount }).map((_, i) => String.fromCharCode(65 + i));
    
    // Find Timing Marks for Baseline-Row Calibration
    const timingMarks: {x: number, y: number}[] = [];
    let contourHierarchy = new cv.Mat();
    let contourMarks = new cv.MatVector();
    cv.findContours(thresh, contourMarks, contourHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contourMarks.size(); ++i) {
      let cnt = contourMarks.get(i);
      let rect = cv.boundingRect(cnt);
      let area = rect.width * rect.height;
      // Look for marks near the edges (timing marks)
      if ((rect.x < W * 0.15 || rect.x > W * 0.85) && area > 50 && area < 4000) {
        timingMarks.push({ x: rect.x + rect.width/2, y: rect.y + rect.height/2 });
      }
      cnt.delete();
    }
    contourMarks.delete();
    contourHierarchy.delete();
    timingMarks.sort((a,b) => a.y - b.y);

    const questionsPerCol = Math.ceil(questionsCount / columnsCount);

    // Draw parameters
    ctx.lineWidth = 2;

    for (let q = 0; q < questionsCount; q++) {
       const colIdx = Math.floor(q / questionsPerCol);
       const r = q % questionsPerCol;

       const expected = answerKey[q + 1];
       
       interface BubbleMark {
         opt: string;
         density: number;
         cx: number;
         cy: number;
         box: Box;
       }
       const marks: BubbleMark[] = [];
       
        for (let o = 0; o < optionsCount; o++) {
         // 1. Mathematical Anchor Alignment (The Global Reference) & Fractional Ratio 
         // Once warped, top-left is (0,0). Use fractional ratio for stability.
         const fracStartX = calibration.gridStart.x / WARPED_W;
         const fracStartY = calibration.gridStart.y / WARPED_H;
         const fracRowH = calibration.rowHeight / WARPED_H;
         const fracColW = calibration.colWidth / WARPED_W;
         const fracColGap = calibration.columnGap / WARPED_W;
         
         const colOffsetX = colIdx * fracColGap;
         // Remove harcoded offset to rely on centroid snapping
         let expectedX = WARPED_W * (fracStartX + colOffsetX + (o * fracColW));
         let expectedY = WARPED_H * (fracStartY + (r * fracRowH));
         
         // 2. Baseline-Row Calibration
         // Use the Centroid of each Timing Mark to define the horizontal axis for that specific row
         const pixelTolerance = (fracRowH * WARPED_H) * 0.5;
         const rowTimingMark = timingMarks.find(tm => Math.abs(tm.y - expectedY) < pixelTolerance);
         let baseCy = expectedY;
         if (rowTimingMark) {
            baseCy = rowTimingMark.y; // Eliminate vertical drifting 
         }

         let cx = Math.round(expectedX);
         let cy = Math.round(baseCy);
         
         // Exact bounding box sizing
         const bubbleDiameter = Math.min(calibration.colWidth, calibration.rowHeight) * 0.8;
         const roiW = Math.round(bubbleDiameter + 2);
         const roiH = Math.round(bubbleDiameter + 2);
         const boxX = Math.round(cx - roiW / 2);
         const boxY = Math.round(cy - roiH / 2);
         
         const box: Box = { x: boxX, y: boxY, width: roiW, height: roiH };
         
         // Sub-pixel Centering Logic
         if (boxX > 0 && boxY > 0 && boxX + roiW < W && boxY + roiH < H) {
             let roiMat = thresh.roi(new cv.Rect(boxX, boxY, roiW, roiH));
             let moments = cv.moments(roiMat, false);
             if (moments.m00 > 50) { // Found a centroid, ignore noise
                 cx = boxX + (moments.m10 / moments.m00);
                 cy = boxY + (moments.m01 / moments.m00);
             }
             roiMat.delete();
         }
         
         if (boxX < 0 || boxY < 0 || boxX + roiW >= W || boxY + roiH >= H) {
           marks.push({ opt: options[o], density: 0, cx, cy, box });
           continue;
         }

         // Visual debug: Removed hardcoded crosshair, using circle overlays in step 5

         const pixels = binCtx.getImageData(boxX, boxY, roiW, roiH).data;
         let blackPixels = 0;
         const totalArea = roiW * roiH;
         
         // Vectorized conceptual approach: count thresholded pixels 
         for (let pIdx = 0; pIdx < pixels.length; pIdx += 4) {
           if (pixels[pIdx] > 128) blackPixels++; 
         }
         
         const density = blackPixels / totalArea;
         marks.push({ opt: options[o], density, cx, cy, box });
         
         // 4. Alignment Visualizer: Draw a green crosshair (+) EXACTLY in the center of the calculated bubble
         // (Disabled crosshairs in favor of circle overlays below)
       }

       // 3. Comparative Density Analysis (Solving False Positives)
       // Step A: Calculate the 'Mean Darkness' of the entire row (white-space baseline)
       const sumDensity = marks.reduce((sum, m) => sum + m.density, 0);
       const meanDensity = sumDensity / optionsCount;
       
       // Subtract baseline
       marks.forEach(m => {
         m.density = Math.max(0, m.density - meanDensity);
       });

       // Step B: Identify the darkest bubble
       marks.sort((a,b) => b.density - a.density);
       const best = marks[0];
       const second = marks[1];
       
       // Step C: ZipGrade Logic
       // Minimum Ink threshold < 10% fill -> Unanswered
       // Diff < 5% -> Double Mark
       const isUnanswered = best.density < 0.10;
       const isDoubleMark = !isUnanswered && second && (best.density - second.density) < 0.05;

       let finalSelection: string[] = [];
       if (!isUnanswered) {
         if (isDoubleMark) finalSelection = [best.opt, second.opt];
         else finalSelection = [best.opt];
       }

       // 5. Feedback Overlay
       marks.forEach(m => {
         const isDetected = finalSelection.includes(m.opt);
         ctx.beginPath();
         ctx.arc(m.cx, m.cy, Math.min(m.box.width, m.box.height) / 2, 0, 2 * Math.PI);
         if (isDetected) {
           ctx.strokeStyle = '#22c55e'; // green-500
         } else {
           ctx.strokeStyle = '#ef4444'; // red-500
         }
         ctx.stroke();
       });

       if (isDoubleMark) {
           // Ambiguous/Multi-mark
           result.anomalies.push({
             questionNumber: q + 1,
             detectedOption: finalSelection.join(','),
             anomalyType: 'double_mark',
             box: best.box, 
             resolved: false,
             isCorrect: false,
             expectedOption: expected
           });
           result.status = 'has_anomalies';
       } else if (!isUnanswered) {
           // Clear Winner
           if (expected && best.opt === expected) {
             totalScore++;
           }
       }
    }

    result.score = totalScore;
    
    // Update result image to warped version WITH Diagnostic Overlay
    result.pageImage = warpedCanvas.toDataURL('image/jpeg', 0.6);

    if (gray) { gray.delete(); gray = null; }
    if (thresh) { thresh.delete(); thresh = null; }
    if (blurred) { blurred.delete(); blurred = null; }
    if (srcMat) { srcMat.delete(); srcMat = null; }
    if (warpedMat) { warpedMat.delete(); warpedMat = null; }

  } catch(e) {
    console.error("OMR Failed", e);
    if (gray && !gray.isDeleted()) { gray.delete(); }
    if (thresh && !thresh.isDeleted()) { thresh.delete(); }
    if (blurred && !blurred.isDeleted()) { blurred.delete(); }
    if (srcMat && !srcMat.isDeleted()) { srcMat.delete(); }
    if (warpedMat && !warpedMat.isDeleted()) { warpedMat.delete(); }
    result.status = result.status === 'needs_attention' ? 'needs_review' : 'failed_omr';
  }

  return result;
}
