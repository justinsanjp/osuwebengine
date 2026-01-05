
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
  language: 'en',
  keys: {
    standard: ['z', 'x'],
    taiko: ['x', 'c', 'v', 'b'],
    mania4k: ['d', 'f', 'j', 'k'],
    catch: ['ArrowLeft', 'ArrowRight', 'Shift']
  }
};

export const TRANSLATIONS = {
  en: {
    welcomeTitle: "Welcome!",
    welcomeText: "First time here?\nWe can download the provided beatmaps for you.",
    download: "Download Maps",
    noThanks: "No thanks, I have my own",
    play: "PLAY",
    settings: "SETTINGS",
    changelog: "CHANGELOG",
    discord: "DISCORD",
    import: "IMPORT FILES",
    back: "BACK TO MENU",
    selectMap: "Select a beatmap or drop one here",
    noMaps: "No beatmaps found",
    dropFiles: "Drop .osz or .osk files here",
    processing: "Processing Data...",
    success: "Success",
    score: "Final Score",
    accuracy: "Accuracy",
    continue: "Continue",
    quit: "QUIT (ESC)",
    language: "Language",
    keys: "Keys",
    saveClose: "SAVE & CLOSE",
    disclaimer: "Disclaimer: This is a fan project and not affiliated with ppy Pty Ltd.\nosu! is a trademark of ppy Pty Ltd.",
    customSkin: "✨ Custom Skin Active",
    mapBy: "Beatmap By",
    selectLang: "Select Language / 言語を選択"
  },
  jp: {
    welcomeTitle: "ようこそ!",
    welcomeText: "初めてですか？\nプレイ可能なビートマップを自動でダウンロードできます。",
    download: "マップをダウンロード",
    noThanks: "いいえ、自分で用意します",
    play: "プレイ",
    settings: "設定",
    changelog: "変更履歴",
    discord: "ディスコード",
    import: "ファイルをインポート",
    back: "メニューに戻る",
    selectMap: "ビートマップを選択、またはファイルをドロップ",
    noMaps: "ビートマップが見つかりません",
    dropFiles: ".osz または .osk ファイルをここにドロップ",
    processing: "データ処理中...",
    success: "クリア",
    score: "スコア",
    accuracy: "精度",
    continue: "続ける",
    quit: "終了 (ESC)",
    language: "言語 (Language)",
    keys: "キー設定",
    saveClose: "保存して閉じる",
    disclaimer: "免責事項: これはファンプロジェクトであり、ppy Pty Ltdとは関係ありません。\nosu! は ppy Pty Ltd の商標です。",
    customSkin: "✨ カスタムスキン適用中",
    mapBy: "作成者:",
    selectLang: "言語を選択 / Select Language"
  }
};
