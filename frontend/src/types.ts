export type Stem = 'guitar' | 'backingTrack';
export const ALL_STEMS: Stem[] = ['guitar', 'backingTrack'];

export interface Song {
  name: string;
  artist?: string;
  duration: number;
}

export interface Bookmark {
  id: number;
  time: number;
  label: string;
}

export type ActiveView = 'assistant' | 'tabs' | 'bookmarks';
export type StemIsolation = 'full' | 'guitar' | 'backingTrack' | 'custom';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}