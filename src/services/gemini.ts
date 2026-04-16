import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const extractWithGemini = async (context: string): Promise<ExtractionResult> => {
  // Using the alias from the skill: gemini flash: 'gemini-flash-latest'
  const model = "gemini-flash-latest"; 

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Extract EVERY SINGLE Minecraft permission node, command, and placeholder from the following documentation context. 
      DO NOT summarize. DO NOT omit any nodes. If a permission has multiple sub-nodes, list them all.
      
      Context:
      ${context.substring(0, 60000)}`,
      config: {
        systemInstruction: "You are a high-performance data extraction engine. Your goal is to find 100% of the permission nodes, commands, and placeholders in the text. Be exhaustive. If you find a table or a list, extract every row.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            permissions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  node: { type: Type.STRING },
                  description: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ['admin', 'user'] }
                },
                required: ['node', 'description', 'category']
              }
            },
            commands: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  command: { type: Type.STRING },
                  description: { type: Type.STRING },
                  permission: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ['admin', 'user'] }
                },
                required: ['command', 'description', 'category']
              }
            },
            placeholders: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  placeholder: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ['placeholder', 'description']
              }
            }
          },
          required: ['permissions', 'commands', 'placeholders']
        }
      }
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty response");
    }

    return JSON.parse(response.text) as ExtractionResult;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
