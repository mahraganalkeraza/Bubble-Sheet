export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CalibrationData {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
  qrBox: Box;
  omrBox: Box; // Area containing the bubbles grid
}

export interface StudentResult {
  id: string; // From QR
  name: string;
  church: string;
  level: string;
  score: number;
  status: 'success' | 'failed_qr' | 'failed_omr' | 'needs_review';
  pageImage?: string; // Data URL for review
}

export type Phase = 'upload' | 'calibrate' | 'answer_key' | 'processing' | 'results';
