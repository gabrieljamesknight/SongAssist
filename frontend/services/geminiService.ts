
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;

if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.warn("API_KEY environment variable not set. AI features will not work.");
}

const parseJsonResponse = <T,>(text: string): T | null => {
    let jsonStr = text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
        jsonStr = match[2].trim();
    }
    try {
        return JSON.parse(jsonStr) as T;
    } catch (e) {
        console.error("Failed to parse JSON response:", e);
        return null;
    }
};

export const getPlayingAdvice = async (songTitle: string, artist: string | undefined, userQuery: string): Promise<string> => {
    if (!ai) return "API Key not configured. Please set the API_KEY environment variable.";
    try {
        const songIdentifier = artist ? `"${songTitle}" by ${artist}` : `"${songTitle}"`;
        const prompt = `As an expert guitar coach, provide advice for playing the song ${songIdentifier}. The user is asking: "${userQuery}". Keep your advice concise, practical, and focused on guitar techniques like chords, strumming patterns, and difficult sections.`;
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: prompt,
            config: {
                systemInstruction: "You are a helpful and encouraging guitar teacher for musicians learning a new song.",
            }
        });

        return response.text ?? "Sorry, no advice could be generated for this query.";
    } catch (error) {
        console.error("Error getting playing advice:", error);
        return "Sorry, I couldn't fetch advice at the moment. Please try again later.";
    }
};

export const generateTabs = async (songTitle: string, artist: string | undefined): Promise<string> => {
    if (!ai) return "API Key not configured. Please set the API_KEY environment variable.";
    try {
        const songIdentifier = artist ? `"${songTitle}" by ${artist}` : `"${songTitle}"`;
        const prompt = `Generate guitar tablature for the song ${songIdentifier}. Provide it in a clear, plain text format. If you can provide chords and structure (e.g., Verse, Chorus), please do. If you cannot find tabs, say so and explain why.`;
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: prompt,
             config: {
                systemInstruction: "You are a musical transcriber that specializes in creating accurate guitar tablature.",
            }
        });

        return response.text ?? "Sorry, tabs could not be generated for this song.";
    } catch (error) {
        console.error("Error generating tabs:", error);
        return "Sorry, I couldn't generate tabs at the moment. Please check the song title and try again.";
    }
};