
export interface SongIdentification {
  songTitle: string;
  artist: string;
}

const API_BASE = import.meta.env.VITE_API_BASE as string;

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE is not set. Add it to your frontend .env.local");
  }
  return API_BASE;
}

// ---- Identify song title/artist from a raw filename (backend LLM) ----
export const identifySongFromFileName = async (rawFileName: string): Promise<SongIdentification | null> => {
  const base = requireApiBase();
  const res = await fetch(`${base}/gemini/identify-from-filename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawFileName }),
  });
  if (!res.ok) {
    console.error("identify-from-filename failed:", res.status);
    return null;
  }
  return (await res.json()) as SongIdentification;
};


export const getInitialSongAnalysis = async (songTitle: string, artist: string | undefined): Promise<string> => {
  if (!songTitle) return "UNKNOWN_SONG";
  const base = requireApiBase();
  const res = await fetch(`${base}/gemini/initial-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songTitle, artist }),
  });
  if (!res.ok) {
    console.error("initial-analysis failed:", res.status);
    return "UNKNOWN_SONG";
  }
  const data = await res.json();
  return typeof data === "string" ? data : (data.text ?? "UNKNOWN_SONG");
};

// ---- Contextual playing advice (backend LLM) ----
export const getPlayingAdvice = async (params: {
  songTitle: string;
  artist?: string;
  section?: string;
  currentIsolation?: string;
  difficulty?: number;
  bookmarks?: { time: number; label?: string }[];
}): Promise<string> => {
  const base = requireApiBase();
  const res = await fetch(`${base}/gemini/playing-advice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    console.error("playing-advice failed:", res.status);
    return "Sorry, I couldn't generate advice right now.";
  }
  const data = await res.json();
  return typeof data === "string" ? data : (data.text ?? "Sorry, I couldn't generate advice right now.");
};


export const generateTabs = async (songTitle: string, artist?: string): Promise<string> => {
  const base = requireApiBase();
  const res = await fetch(`${base}/gemini/generate-tabs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songTitle, artist }),
  });
  if (!res.ok) {
    console.error("generate-tabs failed:", res.status);
    return "Sorry, I couldn't generate tabs at the moment. Please check the song title and try again.";
  }
  const data = await res.json();
  return typeof data === "string" ? data : (data.text ?? "Sorry, I couldn't generate tabs at the moment. Please check the song title and try again.");
};
