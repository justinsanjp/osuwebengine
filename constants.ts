
import { UserSettings } from './types';

export const CIRCLE_RADIUS = 50;
export const APPROACH_TIME = 1000; // ms
export const HIT_WINDOW_300 = 50;
export const HIT_WINDOW_100 = 100;
export const HIT_WINDOW_50 = 150;

export const COLORS = {
  accent: '#ff66aa',
  background: '#1a1a1a',
  ui: '#2a2a2a',
  perfect: '#88eeff',
  good: '#88ff88',
  meh: '#ffff88',
  miss: '#ff4444'
};

export const DEFAULT_SETTINGS: UserSettings = {
  keys: {
    standard: ['z', 'x'],
    taiko: ['x', 'c', 'v', 'b'],
    mania4k: ['d', 'f', 'j', 'k'],
    catch: ['ArrowLeft', 'ArrowRight', 'Shift']
  }
};
