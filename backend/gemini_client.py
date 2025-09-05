import os, json, tempfile
import google.generativeai as genai
from google.generativeai.types import GenerationConfig, HarmCategory, HarmBlockThreshold
from typing import Optional, Dict, Any, Union

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

PROMPT_BASE = """You are a music analysis AI expert for guitarists. Your goal is to provide the most accurate and commonly accepted chord progression for a given song, complete with lyrics, broken down by musical section.

**Analysis Process:**
1.  **Identify the Song:** From the supplemental JSON data, determine the song's title and artist.
2.  **Find Lyrics and Chords:** Access your extensive knowledge of popular music (such as chords from websites like Ultimate Guitar Tabs) to find the standard chords and lyrics for this song. This is your primary source of information.
3.  **Structure the Song:** Identify the main sections of the song (e.g., Intro, Verse 1, Chorus). If you can infer any information on this from the passed audio file then do so but if not then solely use your knowledge.
4.  **Align Chords and Lyrics:** For each section containing lyrics, place the chord name in square brackets (e.g., `[Am]`) directly before the word or syllable where the chord change occurs. For instrumental sections, provide only the chord progression.
5.  **Format the Output:** Respond ONLY with a single JSON object with the exact structure specified below. Do not include timestamps. Only include capo details if it's relevant or the most common way of playing the song.

**CRITICAL FORMATTING RULES:**
1.  **Structure:** For each song section, the `chords` value must be a single string. Inside this string, chords and lyrics are paired on alternating lines. The first line is *only* for chords, the second is *only* for lyrics, the third for chords, the fourth for lyrics, and so on.
2.  **Alignment:** You MUST use spaces to pad the chord lines. The first letter of a chord name must be directly above the first letter of the lyric syllable where that chord is played.
3.  **Content:** Chord lines contain ONLY chord names and spaces. Lyric lines contain ONLY lyrics and punctuation. Try and keep song lines fairly short as the user interface you are outputting into is quite narrow.
4.  **Newlines:** Use the `\\n` character to separate each line within the `chords` string.

**JSON OUTPUT STRUCTURE (EXAMPLE - DO NOT USE THESE CHORDS, FIND THE REAL ONES):**
{
  "tuning": "E Standard",
  "key": "G Major",
  "difficulty": 2,
  "sections": [
    {
      "name": "Chorus",
      "chords":             "G        Em"              
      "lyrics:": "La la la la I love you"
    },
    {
      "name": "Verse 1",
      "chords":    "G               D"
      "lyrics": "I'm singing for you"
    }
  ],
  "notes": "Brief notes on strumming or technique."
}
"""

# Simple patterns to detect token-limit related errors
TOKEN_ERROR_PATTERNS = (
    "maximum token",
    "max token",
    "too many tokens",
    "prompt is too long",
    "input is too long",
    "content is too long",
    "exceeds the maximum",
    "exceeded the maximum",
    "exceeds limit",
    "exceeds the limit",
    "MAX_TOKENS",
    "RESOURCE_EXHAUSTED",
    "InvalidArgument: 400",
)


def _looks_like_token_error(err_or_msg: Union[Exception, str]) -> bool:
    s = str(err_or_msg).lower()
    return any(p.lower() in s for p in TOKEN_ERROR_PATTERNS)


def _truncate(txt: Optional[str], max_len: int) -> str:
    if not txt:
        return ""
    return txt[:max_len]


def generate_text_from_prompt(system_prompt: str, user_prompt: str, model_name: str) -> Dict[str, Any]:
    model = genai.GenerativeModel(model_name)
    try:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        cfg = GenerationConfig(max_output_tokens=2048)
        resp = model.generate_content(full_prompt, generation_config=cfg)
        return {"text": resp.text or ""}
    except Exception as e:
        if _looks_like_token_error(e):
            try:
                simple_system = "You are a helpful assistant. Respond concisely."
                simple_user = _truncate(user_prompt, 2000)
                resp2 = model.generate_content(
                    f"{simple_system}\n\n{simple_user}",
                    generation_config=GenerationConfig(max_output_tokens=768),
                )
                return {"text": resp2.text or ""}
            except Exception as e2:
                print(f"Token fallback also failed: {e2}")
                return {"error": str(e2), "error_code": "TOKEN_LIMIT", "text": "Sorry, the request was too large to process. Try shortening it."}
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

    try:
        resp = model.generate_content(parts, generation_config=config, safety_settings=safety_settings)
    except Exception as e:
        if _looks_like_token_error(e):
            try:
                # Simpler prompt and smaller output budget
                simple_prompt = {
                    "text": (
                        "You are a music analysis assistant. "
                        "Return a concise JSON with keys: tuning, key, difficulty, sections (max 2), and notes. "
                        "Each section has name and a chords string with minimal lines."
                    )
                }
                parts_simple = [simple_prompt, uploaded]
                resp = model.generate_content(
                    parts_simple,
                    generation_config=GenerationConfig(max_output_tokens=2048),
                    safety_settings=safety_settings,
                )
            except Exception as e2:
                print(f"Gemini token-limit fallback failed: {e2}")
                return {"error": "The request was too large for the model to process. Try a shorter clip or simpler request.", "error_code": "TOKEN_LIMIT"}
        else:
            print(f"Gemini analysis error: {e}")
            return {"error": str(e)}

    if not resp.candidates or resp.candidates[0].finish_reason.name != "STOP":
        reason = resp.candidates[0].finish_reason.name if resp.candidates else "NO_RESPONSE"
        if reason == "MAX_TOKENS":
            try:
                brief_prompt = {
                    "text": (
                        "Output a very short JSON: include at most one section and keep notes under 200 characters."
                    )
                }
                resp = model.generate_content(
                    [brief_prompt, uploaded],
                    generation_config=GenerationConfig(max_output_tokens=1024),
                    safety_settings=safety_settings,
                )
            except Exception as e3:
                print(f"MAX_TOKENS fallback failed: {e3}")
                return {"error": f"Analysis terminated due to output length. Please try again.", "error_code": "TOKEN_LIMIT"}
        else:
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
