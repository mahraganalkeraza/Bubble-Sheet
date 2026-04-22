import { GoogleGenerativeAI } from "@google/generative-ai";
import { StudentResult, CalibrationData } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function processPageWithGemini(
  canvas: HTMLCanvasElement,
  answerKey: Record<number, string>,
  questionsCount: number
): Promise<Partial<StudentResult>> {
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const base64Data = dataUrl.split(",")[1];

    const prompt = `
      You are an expert OMR (Optical Mark Recognition) assistant.
      Analyze the provided image of an exam sheet.
      1. Identify the student information (ID, Name, Church, Level) if visible or encoded in any QR codes (don't worry if you can't decode QR, focus on text).
      2. Identify the selected answers for questions 1 to ${questionsCount}.
      
      The answer key is: ${JSON.stringify(answerKey)}
      
      Return the results in JSON format:
      {
        "id": "student_id",
        "name": "student_name",
        "church": "church_name",
        "level": "level",
        "answers": { "1": "A", "2": "B", ... },
        "score": 0
      }
      
      Only return the JSON.
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();
    const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    return {
      id: parsed.id || "Unknown",
      name: parsed.name || "",
      church: parsed.church || "",
      level: parsed.level || "",
      score: parsed.score || 0, // We should calculate this properly if needed
      status: "success"
    };
  } catch (error) {
    console.error("Gemini OMR Workflow Error:", error);
    return { status: "needs_review" };
  }
}

/**
 * Orchestrates the full OMR workflow:
 * 1. Traditional CV (OpenCV)
 * 2. If failure or low confidence, fallback to AI (Gemini)
 */
export async function runCombinedWorkflow(
  cvResult: StudentResult,
  canvas: HTMLCanvasElement,
  answerKey: Record<number, string>,
  questionsCount: number
): Promise<StudentResult> {
  // If CV failed significantly, try AI enhancement
  if (cvResult.status === 'failed_qr' || cvResult.status === 'failed_omr' || cvResult.status === 'needs_review') {
    console.log("CV Workflow struggled, invoking AI fallback...");
    const aiResult = await processPageWithGemini(canvas, answerKey, questionsCount);
    
    return {
      ...cvResult,
      ...aiResult,
      status: aiResult.status === 'success' ? 'success' : cvResult.status
    } as StudentResult;
  }

  return cvResult;
}
