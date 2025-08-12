import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;

if (API_KEY) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
  console.warn("API_KEY environment variable not set. AI features will not work.");
}

// Define a type for the structured response from Gemini
export interface SongIdentification {
    songTitle: string;
    artist: string;
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

export const identifySongFromFileName = async (fileName:string): Promise<SongIdentification | null> => {
    if (!ai) {
        console.error("API Key not configured.");
        return null;
    }
    try {
        const prompt = `From the following filename, analyze the song title and attempt to identify the most likely artist for that song, even if the artist is not in the filename.
        The filename is: "${fileName}"
        
        Return the song title you've extracted and the artist you've identified. For example, if the filename is "Stairway to Heaven.mp3", you should identify the artist as "Led Zeppelin".
        If you are completely unable to guess an artist, return "Unknown Artist" in the artist field.`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert in music and file name parsing. Your task is to extract the song title and infer the artist from a file name and return it as a clean JSON object.",
                // Ensure Gemini returns the data in the specified JSON format
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "songTitle": { "type": "STRING" },
                        "artist": { "type": "STRING" }
                    },
                    required: ["songTitle", "artist"]
                }
            }
        });

        const resultText = response.text;
        if (resultText) {
            // The response should be a valid JSON string based on the schema
            return JSON.parse(resultText) as SongIdentification;
        }
        return null;

    } catch (error) {
        console.error("Error identifying song from file name:", error);
        return null;
    }
};


export const getInitialSongAnalysis = async (songTitle: string, artist: string | undefined): Promise<string> => {
    if (!ai) return "API Key not configured. Please set the API_KEY environment variable.";
    if (!songTitle) return "UNKNOWN_SONG";
    
    try {
        const songIdentifier = artist ? `"${songTitle}" by ${artist}` : `"${songTitle}"`;
        const prompt = `As an expert guitar coach, provide a brief, welcoming analysis for a musician starting to learn the song ${songIdentifier}. Give 1-2 general tips about the guitar part (e.g., key chords, strumming feel, or a famous riff). Keep it encouraging and concise, and address the user directly. If you are not confident you know the correct song, respond with ONLY the text "UNKNOWN_SONG".`;
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are a helpful and encouraging guitar teacher for musicians learning a new song. Your tone is friendly and supportive.",
            }
        });

        return response.text ?? "UNKNOWN_SONG";
    } catch (error) {
        console.error("Error getting initial song analysis:", error);
        return "UNKNOWN_SONG";
    }
};


export const getPlayingAdvice = async (songTitle: string, artist: string | undefined, userQuery: string): Promise<string> => {
    if (!ai) return "API Key not configured. Please set the API_KEY environment variable.";
    try {
        const songIdentifier = artist ? `"${songTitle}" by ${artist}` : `"${songTitle}"`;
        const prompt = `As an expert guitar coach, provide advice for playing the song ${songIdentifier}. The user is asking: "${userQuery}". Keep your advice concise, practical, and focused on guitar techniques like chords, strumming patterns, and difficult sections.`;
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
            model: 'gemini-2.5-flash',
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