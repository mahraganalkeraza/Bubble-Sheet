import jsQR from 'jsqr';
import { CalibrationData, StudentResult, Box } from './types.ts';

// We must declare cv and pdfjsLib since they are loaded via CDN
declare const cv: any;
declare const pdfjsLib: any;

export async function loadPdf(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf;
}

export const PDF_RENDER_SCALE = 2.0;

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

export async function processSinglePage(
  canvas: HTMLCanvasElement, 
  calibration: CalibrationData, 
  answerKey: Record<number, string>,
  questionsCount: number,
  optionsCount: number
): Promise<StudentResult> {
  
  // 1. Perspective Transform using OpenCV
  // Target width/height after warp. Perfect A4 aspect ratio (210mm x 297mm) at high DPI.
  const WARP_W = 2480;
  const WARP_H = 3508;
  
  let srcMat = cv.imread(canvas);
  
  // Points from calibration mapped to [TL, TR, BR, BL]
  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    calibration.topLeft.x, calibration.topLeft.y,
    calibration.topRight.x, calibration.topRight.y,
    calibration.bottomRight.x, calibration.bottomRight.y,
    calibration.bottomLeft.x, calibration.bottomLeft.y
  ]);
  
  // Perfectly matching A4 corner destination points [TL, TR, BR, BL]
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    WARP_W, 0,
    WARP_W, WARP_H,
    0, WARP_H
  ]);
  
  let M = cv.getPerspectiveTransform(srcTri, dstTri);
  let warpedMat = new cv.Mat();
  let dsize = new cv.Size(WARP_W, WARP_H);
  cv.warpPerspective(srcMat, warpedMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

  // Helper to map a raw point to the warped space using M
  const mapPoint = (x: number, y: number) => {
    let ptMat = cv.matFromArray(1, 1, cv.CV_32FC2, [x, y]);
    let dstPtMat = new cv.Mat();
    cv.perspectiveTransform(ptMat, dstPtMat, M);
    const dstArr = dstPtMat.data32F;
    const res = { x: dstArr[0], y: dstArr[1] };
    ptMat.delete();
    dstPtMat.delete();
    return res;
  };

  const mapBox = (box: Box) => {
    const tl = mapPoint(box.x, box.y);
    const br = mapPoint(box.x + box.width, box.y + box.height);
    return {
      x: Math.max(0, tl.x),
      y: Math.max(0, tl.y),
      width: Math.min(WARP_W, br.x - tl.x),
      height: Math.min(WARP_H, br.y - tl.y)
    };
  };

  const warpedQrBox = mapBox(calibration.qrBox);
  const warpedOmrBox = mapBox(calibration.omrBox);
  
  // Create a canvas for the warped output explicitly sized
  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = WARP_W;
  warpedCanvas.height = WARP_H;
  cv.imshow(warpedCanvas, warpedMat);
  const warpedCtx = warpedCanvas.getContext('2d', { willReadFrequently: true })!;
  
  // Base result
  const result: StudentResult = {
    id: 'ID_Unknown',
    name: '',
    church: '',
    level: '',
    score: 0,
    status: 'success',
    pageImage: warpedCanvas.toDataURL('image/jpeg', 0.5)
  };

  // 2. Decode QR Code
  try {
    const safeQx = Math.max(0, Math.min(WARP_W - 1, Math.round(warpedQrBox.x)));
    const safeQy = Math.max(0, Math.min(WARP_H - 1, Math.round(warpedQrBox.y)));
    const safeQw = Math.max(1, Math.min(WARP_W - safeQx, Math.round(warpedQrBox.width)));
    const safeQh = Math.max(1, Math.min(WARP_H - safeQy, Math.round(warpedQrBox.height)));
    
    // Sharpness Filter (Unsharp Mask) to increase high-density QR contrast
    let qrRoi = new cv.Rect(safeQx, safeQy, safeQw, safeQh);
    let qrMat = warpedMat.roi(qrRoi);
    
    let blurred = new cv.Mat();
    cv.GaussianBlur(qrMat, blurred, new cv.Size(0, 0), 3);
    let sharpened = new cv.Mat();
    cv.addWeighted(qrMat, 1.5, blurred, -0.5, 0, sharpened);
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = safeQw;
    tempCanvas.height = safeQh;
    cv.imshow(tempCanvas, sharpened);
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
    const qrImgData = tempCtx.getImageData(0, 0, safeQw, safeQh);
    
    qrMat.delete();
    blurred.delete();
    sharpened.delete();

    const code = jsQR(qrImgData.data, qrImgData.width, qrImgData.height);
    
    if (code) {
      let rawData = code.data || '';
      
      // jsQR sometimes struggles with native UTF-8 Arabic text. 
      // Fortunately it exposes `binaryData` which is the actual byte matrix.
      try {
        if (code.chunks && code.chunks.length > 0) {
          // Decode raw bytes to UTF-8
          rawData = new TextDecoder("utf-8").decode(Uint8Array.from(code.binaryData));
        }
      } catch (e) {
        // Silently fail to standard property
      }

      // Try parsing as JSON first
      try {
        const studentData = JSON.parse(rawData);
        result.id = studentData.id || studentData.Student_ID || rawData;
        
        // n = Name, c = Church, l = Level
        result.name = studentData.n || studentData.name || '';
        result.church = studentData.c || studentData.church || '';
        result.level = studentData.l || studentData.level || '';
      } catch (e) {
        // Not JSON, fallback to standard delimiters
        if (rawData.includes('-')) {
          const parts = rawData.split('-').map(p => p.trim());
          if (parts.length >= 3) {
              result.id = parts[parts.length - 1] || ''; // The last part is the Unique ID
              result.name = parts[0] || '';              // The first part is the Name
              result.church = parts[1] || '';            // The second part is the Church
              result.level = parts[2] || '';             // The third part is the Level
          } else {
              result.id = rawData;
          }
        } else {
          result.id = rawData; // Just raw ID
        }
      }
    } else {
      result.status = 'failed_qr';
    }
  } catch(e) {
    result.status = 'failed_qr';
    console.error('QR Reading error:', e);
  }

  // 3. OMR Processing
  try {
    // Generate grid based on omrBox
    // We assume columns of questions. Say, 25 questions per column.
    const questionsPerCol = 25;
    const numCols = Math.ceil(questionsCount / questionsPerCol);
    const colWidth = warpedOmrBox.width / numCols;
    const rowHeight = warpedOmrBox.height / questionsPerCol;
    
    // Convert to grayscale & threshold for bubble detection
    let gray = new cv.Mat();
    cv.cvtColor(warpedMat, gray, cv.COLOR_RGBA2GRAY, 0);
    let thresh = new cv.Mat();
    // Use adaptive thresholding or fixed
    cv.threshold(gray, thresh, 180, 255, cv.THRESH_BINARY_INV);
    
    cv.imshow(warpedCanvas, thresh); // Temporary to get inverted binary pixels
    const binCtx = warpedCanvas.getContext('2d')!;
    
    let totalScore = 0;

    for (let q = 0; q < questionsCount; q++) {
      const col = Math.floor(q / questionsPerCol);
      const row = q % questionsPerCol;
      
      const qX = warpedOmrBox.x + (col * colWidth);
      const qY = warpedOmrBox.y + (row * rowHeight);

      
      const optWidth = colWidth / (optionsCount + 1); // +1 because usually there's question number
      
      let maxDarkness = 0;
      let selectedOption = '';
      
      const options = Array.from({ length: optionsCount }).map((_, i) => String.fromCharCode(65 + i));
      
      for (let o = 0; o < optionsCount; o++) {
        const optChar = options[o];
        const bx = qX + ((o + 1) * optWidth); // Shift right by 1 block to skin Q-number
        const by = qY;
        const bw = optWidth * 0.8; 
        const bh = rowHeight * 0.8;
        
        // Analyze pixel density in (bx, by, bw, bh)
        // Ensure coords are within bounds
        const safeX = Math.max(0, Math.min(WARP_W - 1, bx));
        const safeY = Math.max(0, Math.min(WARP_H - 1, by));
        const safeW = Math.min(WARP_W - safeX, bw);
        const safeH = Math.min(WARP_H - safeY, bh);
        
        const pixels = binCtx.getImageData(safeX, safeY, safeW, safeH).data;
        let whitePixels = 0; // because we inverted, mark is white
        for (let p = 0; p < pixels.length; p += 4) {
          if (pixels[p] > 128) whitePixels++;
        }
        
        const density = whitePixels / (safeW * safeH);
        
        if (density > maxDarkness && density > 0.3) { // 30% fill threshold
          maxDarkness = density;
          selectedOption = optChar;
        }
      }
      
      const expected = answerKey[q + 1];
      if (expected && selectedOption === expected) {
        totalScore++;
      }
    }
    
    result.score = totalScore;
    
    gray.delete();
    thresh.delete();

  } catch(e) {
    console.error("OMR Failed", e);
    result.status = result.status === 'failed_qr' ? 'needs_review' : 'failed_omr';
  }
  
  // Cleanup
  srcMat.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();
  warpedMat.delete();
  
  return result;
}

export const WARPED_W = 2480;
export const WARPED_H = 3508;
