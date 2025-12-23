
export enum GameState {
  MAIN_MENU = 'MAIN_MENU',
  SONG_SELECT = 'SONG_SELECT',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  RESULTS = 'RESULTS'
}

export enum GameMode {
  STANDARD = 0,
  TAIKO = 1,
  CATCH = 2,
  MANIA = 3
}

export enum HitObjectType {
  CIRCLE = 1,
  SLIDER = 2,
  SPINNER = 8
}

export interface UserSettings {
  keys: {
    standard: string[];
    taiko: string[];
    mania4k: string[];
  };
}

export interface TimingPoint {
  time: number;
  beatLength: number;
  inherited: boolean;
}

export interface SkinData {
  cursor?: string;
  hitcircle?: string;
  approachcircle?: string;
  cursorTrail?: string;
  spinnerBottom?: string;
  spinnerTop?: string;
  taikoInner?: string;
  taikoOuter?: string;
}

export interface HitObject {
  id: number;
  x: number;
  y: number;
  time: number;
  type: HitObjectType;
  hit: boolean;
  missed: boolean;
  endTime: number;
  hitSound: number; // Added for Taiko (Normal/Whistle/Finish/Clap)
  sliderPoints?: { x: number; y: number }[];
  pixelLength?: number;
  slides?: number;
  wasSpun?: boolean;
}

export interface ScoreData {
  totalScore: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  count300: number;
  count100: number;
  count50: number;
  countMiss: number;
}

export interface Beatmap {
  id: string;
  mode: GameMode;
  title: string;
  artist: string;
  creator: string;
  difficulty: string;
  difficultyValue: number;
  approachRate: number;
  overallDifficulty: number;
  circleSize: number;
  bpm: number;
  objects: HitObject[];
  timingPoints: TimingPoint[];
  duration: number;
  audioBuffer?: AudioBuffer;
  backgroundUrl?: string;
  sourceFile: string;
  previewTime?: number;
  sliderMultiplier?: number;
}

export interface BeatmapSet {
  title: string;
  artist: string;
  creator: string;
  backgroundUrl?: string;
  difficulties: Beatmap[];
}
