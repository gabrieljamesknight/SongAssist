export type Stem = 'guitar' | 'backingTrack';
export const ALL_STEMS: Stem[] = ['guitar', 'backingTrack'];

export interface Song {
  name: string;
  artist: string;
  duration: number;
  artistConfirmed: boolean;
  stemUrls?: Record<string, string>;
}

export interface Bookmark {
  id: number;
  start: number;
  end: number; 
  label: string;
}

export type ActiveView = 'assistant' | 'tabs' | 'bookmarks';
export type StemIsolation = 'full' | 'guitar' | 'backingTrack' | 'custom';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Project {
  taskId: string;
  originalFileName: string;
  manifestUrl: string;
}