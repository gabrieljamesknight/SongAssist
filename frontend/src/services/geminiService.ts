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

const formatWithChordsAbove = (text: string): string => {
  if (!text || !text.includes('[')) {
    return text;
  }

  return text
    .split('\n')
    .map(line => {
      if (!line.includes('[')) return line;

      const chords: { text: string; index: number }[] = [];
      const regex = /\[([^\]]+)\]/g;
      let match;
      while ((match = regex.exec(line)) !== null) {
        chords.push({ text: match[1], index: match.index });
      }

      if (chords.length === 0) return line;

      const lyricLine = line.replace(/\[[^\]]+\]/g, '');
      const chordLineChars = Array(lyricLine.length).fill(' ');

      let offset = 0;
      chords.forEach(chord => {
        const pos = chord.index - offset;
        if (pos >= 0) {
            chord.text.split('').forEach((char, i) => {
                if (pos + i < chordLineChars.length) {
                    chordLineChars[pos + i] = char;
                }
            });
        }
        offset += chord.text.length + 2;
      });

      return `${chordLineChars.join('').trimEnd()}\n${lyricLine}`;
    })
    .join('\n');
};


export const formatChordAnalysis = (result: any): string => {
  let formattedOutput = `### AI Analysis\n\n`;
  formattedOutput += `* **Tuning:** ${result.tuning || 'Unknown'}\n`;
  formattedOutput += `* **Key:** ${result.key || 'Unknown'}\n`;
  formattedOutput += `* **Difficulty:** ${result.difficulty || 'N/A'}/10\n\n`;

  if (result.sections && Array.isArray(result.sections) && result.sections.length > 0) {
      formattedOutput += `### Chord Progression\n\n`;
      result.sections.forEach((section: { name: string; chords: string }) => {
          if (section.name && section.chords) {
            formattedOutput += `**${section.name}**\n`;
            formattedOutput += "```\n";
            formattedOutput += `${formatWithChordsAbove(section.chords)}\n`;
            formattedOutput += "```\n\n";
          }
      });
  } else {
      formattedOutput += `No chord progression was identified by the AI.\n\n`;
  }

  if(result.notes) {
      formattedOutput += `### Notes\n\n${result.notes}`;
  }

  return formattedOutput;
};

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

export const analyzeChordsFromStem = async (
    username: string, 
    taskId: string,
    songTitle: string,
    artist: string | undefined
): Promise<string> => {
  const base = requireApiBase();
  const res = await fetch(`${base}/gemini/analyze-stem`, { 
    method: "POST", 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        username,
        task_id: taskId,
        songTitle,
        artist
    }),
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

  return formatChordAnalysis(data.result);
};

export const saveChordAnalysis = async (
    username: string,
    taskId: string,
    content: string
): Promise<void> => {
  const base = requireApiBase();
  const res = await fetch(`${base}/${username}/${taskId}/analysis`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown' },
    body: content,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error("save-analysis failed:", res.status, errorBody);
    throw new Error('Failed to save chord analysis.');
  }
};