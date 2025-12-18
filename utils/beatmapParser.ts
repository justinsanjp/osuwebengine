
import JSZip from 'jszip';
import { Beatmap, HitObject, HitObjectType, TimingPoint } from '../types';

export const parseOsuFile = (content: string, sourceFile: string): Partial<Beatmap> => {
  const lines = content.split(/\r?\n/);
  const beatmap: Partial<Beatmap> = { 
    objects: [], 
    timingPoints: [],
    sourceFile,
    approachRate: 5,
    circleSize: 5,
    overallDifficulty: 5,
    sliderMultiplier: 1.4
  };
  let currentSection = '';

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      continue;
    }

    if (currentSection === 'Metadata') {
      if (line.startsWith('Title:')) beatmap.title = line.split(':')[1].trim();
      if (line.startsWith('Artist:')) beatmap.artist = line.split(':')[1].trim();
      if (line.startsWith('Creator:')) beatmap.creator = line.split(':')[1].trim();
      if (line.startsWith('Version:')) beatmap.difficulty = line.split(':')[1].trim();
    }

    if (currentSection === 'Difficulty') {
      if (line.startsWith('ApproachRate:')) beatmap.approachRate = parseFloat(line.split(':')[1].trim());
      if (line.startsWith('CircleSize:')) beatmap.circleSize = parseFloat(line.split(':')[1].trim());
      if (line.startsWith('OverallDifficulty:')) beatmap.overallDifficulty = parseFloat(line.split(':')[1].trim());
      if (line.startsWith('SliderMultiplier:')) beatmap.sliderMultiplier = parseFloat(line.split(':')[1].trim());
    }

    if (currentSection === 'TimingPoints') {
      const parts = line.split(',');
      if (parts.length >= 2) {
        beatmap.timingPoints!.push({
          time: parseFloat(parts[0]),
          beatLength: parseFloat(parts[1]),
          inherited: parts[6] === '0'
        });
      }
    }

    if (currentSection === 'Events') {
      // Flexiblerer Regex für Hintergründe (0,0,"filename",x,y)
      const bgMatch = line.match(/^0,0,["']?([^"']+)["']?/i);
      if (bgMatch && !beatmap.backgroundUrl) {
        (beatmap as any).bgFilename = bgMatch[1].replace(/\\/g, '/');
      }
    }

    if (currentSection === 'HitObjects') {
      const parts = line.split(',');
      if (parts.length >= 5) {
        const x = parseInt(parts[0]);
        const y = parseInt(parts[1]);
        const time = parseInt(parts[2]);
        const typeBitmask = parseInt(parts[3]);
        
        let type = HitObjectType.CIRCLE;
        if (typeBitmask & 2) type = HitObjectType.SLIDER;
        else if (typeBitmask & 8) type = HitObjectType.SPINNER;

        const obj: HitObject = {
          id: beatmap.objects!.length,
          x, y, time, type,
          hit: false,
          missed: false,
          endTime: time
        };

        if (type === HitObjectType.SLIDER && parts.length >= 8) {
          const sliderData = parts[5].split('|');
          const points = [{ x, y }];
          for (let i = 1; i < sliderData.length; i++) {
            const p = sliderData[i].split(':');
            if(p.length === 2) points.push({ x: parseInt(p[0]), y: parseInt(p[1]) });
          }
          obj.sliderPoints = points;
          obj.slides = parseInt(parts[6]);
          obj.pixelLength = parseFloat(parts[7]);

          // Aktuellen Timing Point finden
          let currentTP = beatmap.timingPoints![0];
          let sliderVelocityMultiplier = 1.0;
          for (const tp of beatmap.timingPoints!) {
            if (tp.time <= time) {
              if (!tp.inherited) {
                currentTP = tp;
                sliderVelocityMultiplier = 1.0;
              } else {
                // Inherited points: beatLength is -100 / multiplier
                sliderVelocityMultiplier = Math.max(0.1, -100 / tp.beatLength);
              }
            } else break;
          }

          const beatLength = currentTP ? currentTP.beatLength : 500;
          const sliderMultiplier = beatmap.sliderMultiplier || 1.4;
          // Osu! Slider duration: (pixelLength / (100 * sliderMultiplier * velocityMultiplier)) * beatLength
          const duration = (obj.pixelLength / (sliderMultiplier * 100 * sliderVelocityMultiplier)) * beatLength;
          obj.endTime = time + duration * obj.slides;
        } else if (type === HitObjectType.SPINNER && parts.length >= 6) {
          obj.endTime = parseInt(parts[5]);
          obj.x = 256; obj.y = 192;
        }

        beatmap.objects!.push(obj);
      }
    }
  }

  beatmap.difficultyValue = (beatmap.approachRate! + beatmap.overallDifficulty!) / 2;
  if (beatmap.objects && beatmap.objects.length > 0) {
    beatmap.duration = Math.max(...beatmap.objects.map(o => o.endTime)) + 1000;
  }

  return beatmap;
};

export const loadOsz = async (file: File, audioCtx: AudioContext): Promise<Beatmap[]> => {
  const zip = await JSZip.loadAsync(file);
  const osuFiles = Object.keys(zip.files).filter(name => name.endsWith('.osu'));
  if (osuFiles.length === 0) return [];

  // Audio finden
  const firstOsuContent = await zip.files[osuFiles[0]].async('text');
  const audioMatch = firstOsuContent.match(/AudioFilename\s*:\s*(.+)/);
  const audioFilename = audioMatch ? audioMatch[1].trim().replace(/\\/g, '/') : null;

  let audioBuffer: AudioBuffer | undefined;
  if (audioFilename) {
    const fileInZip = Object.keys(zip.files).find(n => n.toLowerCase() === audioFilename.toLowerCase());
    if (fileInZip) {
      const audioData = await zip.files[fileInZip].async('arraybuffer');
      audioBuffer = await audioCtx.decodeAudioData(audioData);
    }
  }

  const beatmaps: Beatmap[] = [];
  for (const osuFileName of osuFiles) {
    const content = await zip.files[osuFileName].async('text');
    const parsed = parseOsuFile(content, osuFileName);
    
    let backgroundUrl: string | undefined;
    const bgName = (parsed as any).bgFilename;
    if (bgName) {
      // Case-insensitive Suche nach der Bilddatei
      const imgFileInZip = Object.keys(zip.files).find(n => n.toLowerCase() === bgName.toLowerCase());
      if (imgFileInZip) {
        const bgBlob = await zip.files[imgFileInZip].async('blob');
        backgroundUrl = URL.createObjectURL(bgBlob);
      }
    }

    if (parsed.objects && parsed.objects.length > 0) {
      beatmaps.push({
        ...parsed,
        id: Math.random().toString(36).substr(2, 9),
        audioBuffer,
        backgroundUrl
      } as Beatmap);
    }
  }
  return beatmaps;
};
