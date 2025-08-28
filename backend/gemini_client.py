import os, json, tempfile
import google.generativeai as genai
from google.generativeai.types import GenerationConfig, HarmCategory, HarmBlockThreshold
from typing import Optional, Dict, Any

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_BASE = """You are a music analysis AI expert for guitarists. Your goal is to provide the most accurate and commonly accepted chord progression for a given song, broken down by musical section.
**Analysis Process:**
1.  **Identify the Song:** From the supplemental JSON data, determine the song's title and artist.
2.  **Consult Knowledge Base:** Access your extensive knowledge of popular music (such as chords from websites like Ultimate Guitar Tabs) to find the standard chords for this song. Pay close attention to the order of the chords within the progression. This is your primary source of information. Attempt to find the lyrics as well where possible.
3.  **Structure the Song:** Identify the main sections of the song (e.g., Intro, Verse, Chorus, Bridge). Use the provided audio to help verify the sequence of these sections. Align the chords with lyrics but only when you are 100% sure you have the correct lyrics.
4.  **Format the Output:** Respond ONLY with a single JSON object with the exact structure specified below. Do not include timestamps. Only include capo details if it's relevant or the most common way of playing the song.

(Ignore all chords in this output structure they are example chords only. Only use your knowledge base to draw the chords from.)
**JSON Output Structure:**
{
  "tuning": "E Standard (Capo 2nd Fret)",
  "key": "F# minor",
  "difficulty": 4,
  "sections": [
    {
      "name": "Intro",
      "chords": "Em7 | G | Dsus4 | A7sus4"
    },
    {
      "name": "Verse",
      "chords": "Em7 | G | Dsus4 | A7sus4 | Em7 | G | Dsus4 | A7sus4"
    }
  ],
  "notes": "A brief analysis of the harmony, strumming patterns, or techniques observed. Mention common variations if applicable."
}
"""

def generate_text_from_prompt(system_prompt: str, user_prompt: str, model_name: str) -> Dict[str, Any]:
    model = genai.GenerativeModel(model_name)
    try:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        resp = model.generate_content(full_prompt)
        return {"text": resp.text or ""}
    except Exception as e:
        print(f"Error during Gemini text generation: {e}")
        return {"error": str(e), "text": "Sorry, an error occurred while contacting the AI."}

def analyze_guitar_file(local_audio_path: str,
                        model_name: str,
                        user_prompt: Optional[str] = None,
                        extra_context_json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    model = genai.GenerativeModel(model_name)

    uploaded = genai.upload_file(local_audio_path)

    parts = []
    parts.append({"text": PROMPT_BASE})
    if user_prompt:
        parts.append({"text": f"User request: {user_prompt}"})
    if extra_context_json:
        context_text = json.dumps(extra_context_json)
        parts.append({"text": f"Supplemental JSON Data:\n{context_text}"})

    parts.append(uploaded)
    
    config = GenerationConfig(max_output_tokens=8192)
    
    safety_settings = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
    }

    resp = model.generate_content(parts, generation_config=config, safety_settings=safety_settings)

    if not resp.candidates or resp.candidates[0].finish_reason.name != "STOP":
        reason = resp.candidates[0].finish_reason.name if resp.candidates else "NO_RESPONSE"
        print(f"Gemini analysis terminated with reason: {reason}")
        return {"error": f"Analysis terminated unexpectedly. Reason: {reason}. This can be intermittent, please try again."}

    text = resp.text or ""

    try:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end+1])
    except Exception:
        pass

    return {"notes": "Model response could not be parsed as JSON.", "raw": text}