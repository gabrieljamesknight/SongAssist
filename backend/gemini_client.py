import os, json, tempfile
import google.generativeai as genai
from google.generativeai.types import GenerationConfig, HarmCategory, HarmBlockThreshold
from typing import Optional, Dict, Any

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_BASE = """You are a guitar analysis AI.
Analyze the provided guitar audio stem and supplemental JSON data to return ONLY a single JSON object.

The supplemental JSON data contains:
1. "bpm": The song's tempo.
2. "key": The song's musical key.
3. "chord_progression": A list of chords identified in the audio. 'm' denotes a minor chord, 'N/C' means 'No Chord' was confidently detected.

Use the audio file for rhythmic and timbral details (like strumming patterns or distortion), but use the chord_progression to guide your harmonic analysis. Your primary task is to infer the tuning, difficulty, sections, and main riffs. Generate tablature for at least one or two key riffs.

The JSON response should have this exact structure:
{
  "tuning": "E Standard",
  "bpm": 0,
  "key": "Unknown",
  "difficulty": 5,
  "sections": [{"start": 0.0, "label": "Intro"}],
  "riffs": [{"start": 12.5, "end": 18.0, "description": "Main Riff", "tab": "e|--0--|\\nB|--0--|"}],
  "notes": "General analysis notes."
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