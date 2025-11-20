export interface PageData {
  pageNumber: number;
  content: string;
}

export interface AudioState {
  isPlaying: boolean;
  isPaused: boolean;
}

export type Theme = 'light' | 'sepia' | 'dark' | 'high-contrast';
export type ViewMode = 'scroll' | 'flip';

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export enum AudioFormat {
  MP3 = 'audio/mp3',
  OGG_OPUS = 'audio/ogg',
  WAV = 'audio/wav',
}

export interface TOCItem {
  title: string;
  pageNumber: number;
  section?: string;
}

export interface ParsedBook {
  pages: PageData[];
  toc: TOCItem[];
}

export interface HistoryItem {
  pageNumber: number;
  timestamp: number;
}