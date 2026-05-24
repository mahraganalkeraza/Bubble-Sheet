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

export interface OMRAnomaly {
  questionNumber: number;
  detectedOption: string;
  anomalyType: 'faded' | 'incomplete' | 'cross_out' | 'double_mark';
  box: Box;
  resolved: boolean;
  isCorrect: boolean;
  expectedOption?: string;
}

export interface CalibrationData {
  topRightAnchor: Point; // Vertical black line reference
  gridStart: Point;      // Center of first row bubble (Q1, Opt A)
  rowHeight: number;     // Vertical spacing between rows
  colWidth: number;      // Horizontal spacing between options
  columnGap: number;     // Distance between the start of Column 1 and Column 2 (if columnsCount > 1)
  qrBoxOffset: Box;      // Relative offset from topRightAnchor (% of page width/height)
}

export interface StudentResult {
  id: string; // From QR
  name: string;
  church: string;
  level: string;
  score: number;
  status: 'success' | 'failed_qr' | 'failed_omr' | 'needs_review' | 'has_anomalies' | 'needs_attention';
  pageImage?: string; // Data URL for review
  pageWidth?: number;
  pageHeight?: number;
  anomalies?: OMRAnomaly[];
  errorLog?: string[];
  warning?: string;
  isManuallyResolved?: boolean;
  pageBoundaryPoints?: Point[];
}

export type Phase = 'upload' | 'calibrate' | 'answer_key' | 'processing' | 'results';
