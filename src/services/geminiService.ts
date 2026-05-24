import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

const getAIInstance = () => {
  if (!ai) {
    // Lazy initialization to ensure process.env is ready and prevent top-level crashes
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
};

export const getAIResponse = async (userMessage: string): Promise<string> => {
  try {
    const instance = getAIInstance();
    const model = 'gemini-2.5-flash';
    const response = await instance.models.generateContent({
      model,
      contents: userMessage,
      config: {
        systemInstruction: "Eres un asistente médico virtual útil y amable para la plataforma MEDINEX. Respondes preguntas generales sobre salud, citas y uso de la plataforma. No das diagnósticos médicos definitivos, siempre sugieres consultar a un profesional. Tus respuestas son breves y empáticas.",
      }
    });

    return response.text || "Lo siento, no pude procesar tu solicitud.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Hubo un error al conectar con el asistente inteligente. Por favor intenta más tarde.";
  }
};

export const editImageWithAI = async (imageBase64: string, prompt: string): Promise<string | null> => {
  try {
    const instance = getAIInstance();
    // Using Gemini 2.5 Flash Image as requested for image editing tasks
    const model = 'gemini-2.5-flash-image';
    
    // Remove data URL prefix if present to get raw base64
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    const response = await instance.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png', // The API is flexible, but treating as png/jpeg is standard
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    // Iterate through parts to find the image output
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          // Construct data URL for the frontend
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};
