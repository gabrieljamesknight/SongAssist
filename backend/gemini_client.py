import os, json, tempfile
import google.generativeai as genai
from typing import Optional, Dict, Any

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

_MODEL = "gemini-2.5-flash"

PROMPT_BASE = """You are a guitar practice assistant.
Given a mono or stereo guitar stem from a song, produce structured, practical output:
- Tuning guess, tempo (if inferable), key (probable), playing difficulty (1–10).
- Section boundaries (timestamp -> label like Intro/Verse/Chorus/Bridge/Outro).
- Riff summaries: timestamp ranges, techniques (slides, bends, hammer‑ons), and bar-count.
- If asked for tabs, include short tab snippets for notable riffs (concise, ASCII).

Prefer JSON with this shape:
{
  "tuning": "E Standard",
  "bpm": 0,
  "key": "Unknown",
  "difficulty": 5,
  "sections": [{"start": 0.0, "label": "Intro"}],
  "riffs": [{"start": 12.5, "end": 18.0, "description": "...", "tab": "optional"}],
  "notes": "freeform"
}
If certainty is low, set fields conservatively and explain in 'notes'.
"""

def generate_text_from_prompt(system_prompt: str, user_prompt: str) -> Dict[str, Any]:
    model = genai.GenerativeModel(_MODEL)
    try:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        resp = model.generate_content(full_prompt)
        return {"text": resp.text or ""}
    except Exception as e:
        print(f"Error during Gemini text generation: {e}")
        return {"error": str(e), "text": "Sorry, an error occurred while contacting the AI."}

def analyze_guitar_file(local_audio_path: str,
                        user_prompt: Optional[str] = None,
                        extra_context_json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    model = genai.GenerativeModel(_MODEL)

    uploaded = genai.upload_file(local_audio_path)

    parts = []
    parts.append({"text": PROMPT_BASE})
    if user_prompt:
        parts.append({"text": f"User request: {user_prompt}"})
    if extra_context_json:
        context_text = json.dumps(extra_context_json)[:200000]
        parts.append({"text": f"Extra analysis data (JSON):\n{context_text}"})

    parts.append(uploaded)

    resp = model.generate_content(parts)
    text = resp.text or ""

    try:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end+1])
    except Exception:
        pass

    return {"notes": "Model response could not be parsed as JSON.", "raw": text}