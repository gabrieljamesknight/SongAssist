import os, json, tempfile
import google.generativeai as genai
from google.generativeai.types import GenerationConfig, HarmCategory, HarmBlockThreshold
from typing import Optional, Dict, Any

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_BASE = PROMPT_BASE = """You are a guitar analysis AI.
Analyze the provided guitar audio stem and return ONLY a single JSON object.
You will be provided with pre-analyzed musical data in an "Extra analysis data (JSON)" object. Prioritize this data for fields like 'key' and 'bpm'.
Use the audio file primarily to generate tablature for the identified riffs and sections. If the provided JSON data appears to contradict the audio, mention this discrepancy in the 'notes' field.
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
Be concise. Infer difficulty (1-10) and identify sections and key riffs with timestamps, descriptions, and ASCII tabs.
If uncertain about a value not present in the extra data, use conservative values and explain in the 'notes' field.
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
        context_text = json.dumps(extra_context_json)[:50000]
        parts.append({"text": f"Extra analysis data (JSON):\n{context_text}"})

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