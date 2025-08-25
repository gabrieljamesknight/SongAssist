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

export const generateTabsFromStem = async (username: string, taskId: string): Promise<string> => { 
  const base = requireApiBase(); 
  const formData = new FormData(); 
  formData.append('username', username); 
  formData.append('task_id', taskId); 
  formData.append('include_essentia', 'true');

  const res = await fetch(`${base}/gemini/analyze-stem`, { 
    method: "POST", 
    body: formData, 
  }); 

  if (!res.ok) { 
    const errorBody = await res.text(); 
    console.error("analyze-stem failed:", res.status, errorBody); 
    throw new Error("Failed to analyze the audio stem with AI."); 
  } 
  
  const data = await res.json(); 
  if (!data.ok || !data.result) { 
      throw new Error(data.detail || "Analysis failed on the server or returned no result."); 
  } 

  const result = data.result; 
    
  let formattedTabs = `Tuning: ${result.tuning || 'Unknown'}\nKey: ${result.key || 'Unknown'}\nBPM: ${result.bpm || 'N/A'}\nDifficulty: ${result.difficulty || 'N/A'}/10\n\n`;

  if (result.riffs && result.riffs.length > 0) { 
    const riffsWithTabs = result.riffs.filter((r: any) => r.tab && r.tab.trim() !== ''); 
    if (riffsWithTabs.length > 0) { 
        formattedTabs += riffsWithTabs.map((riff: any) =>  
            `--- ${riff.description} (starts at ${riff.start.toFixed(1)}s) ---\n\`\`\`\n${riff.tab}\n\`\`\`` 
        ).join('\n\n'); 
    } else { 
        formattedTabs += "The AI analysis did not produce any specific tablature for this track."; 
    } 
  } else { 
     formattedTabs += "No distinct riffs were identified by the AI."; 
  } 

  if(result.notes) { 
      formattedTabs += `\n\n--- AI Notes ---\n${result.notes}`; 
  } 

  return formattedTabs; 
};