
export interface Song {
  name: string;
  artist?: string;
  duration: number; // in seconds
}

export interface Bookmark {
  id: number;
  time: number; // in seconds
  label: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export type Stem = 'guitar' | 'backingTrack';

export const ALL_STEMS: Stem[] = ['guitar', 'backingTrack'];

export type ActiveView = 'assistant' | 'tabs' | 'bookmarks';

export type StemIsolation = 'full' | 'guitar_only' | 'no_guitar';