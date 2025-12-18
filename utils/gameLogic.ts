
import { HitObject, Beatmap, HitObjectType } from '../types';

export const generateSampleBeatmap = (title: string, diff: string): Beatmap => {
  const objects: HitObject[] = [];
  const duration = 30000; // 30 seconds
  const padding = 100;

  for (let i = 0; i < 40; i++) {
    const time = 2000 + i * 700;
    objects.push({
      id: i,
      x: padding + Math.random() * (window.innerWidth - padding * 2),
      y: padding + Math.random() * (window.innerHeight - padding * 2),
      time: time,
      type: HitObjectType.CIRCLE,
      endTime: time,
      hit: false,
      missed: false
    });
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    title,
    artist: "Demo Artist",
    creator: "System",
    difficulty: diff,
    difficultyValue: 5,
    approachRate: 5,
    overallDifficulty: 5,
    circleSize: 5,
    bpm: 120,
    objects,
    timingPoints: [],
    duration,
    sourceFile: "generated"
  };
};
