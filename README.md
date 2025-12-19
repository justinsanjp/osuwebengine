# 🎯 Justin's Osu! Web Engine

A high-performance, browser-based rhythm game engine that faithfully recreates the Osu! gameplay experience on the web. Built with a focus on precise timing, smooth animations, and full support for existing beatmaps.

---

## Quick Links

[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC.svg)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-JOWE--CL-orange.svg)](LICENSE.md)
[![GitHub](https://img.shields.io/badge/GitHub-osuwebengine-black.svg)](https://github.com/justinsanjp/osuwebengine)

---
---
## AI Notice

This project was developed with partial assistance from **Gemini 3 Pro** via Google AI Studio.

While AI was used as a supporting tool, a substantial portion of the codebase was written and designed manually. In several cases, AI-generated output required correction or replacement due to bugs or suboptimal implementations. Ensuring code quality and correctness remained a manual responsibility throughout the project.

Estimated contribution breakdown:
- ~35% AI-generated code  
- ~15% AI-assisted revisions  
- ~50% fully manual implementation  

Transparency regarding the use of AI tools is important to me, and all architectural decisions, final implementations, and validations were made by myself.
---

## ✨ Features

### 🎵 Native .osz Import
Drag-and-drop your favorite beatmaps directly into the engine. The engine automatically extracts and processes audio files, backgrounds, and hit objects in real-time.

### ⚙️ Precise Engine Logic
- **Accurate Calculations**: Approach Rate (AR) and Circle Size (CS) computed according to official Osu! specifications
- **Correct Slider Physics**: Full velocity multiplier support and timing point synchronization
- **Hit Detection**: Frame-perfect hit registration with proper margin calculations

### 🔊 Web Audio API Integration
Minimal latency through direct `AudioContext` usage ensures perfect synchronization between audio and visual elements.

### 🎨 Modern UI/UX
- Responsive interface design with dynamic backgrounds
- Smooth blur effects and fluid transitions
- Built with Tailwind CSS for consistent styling

### 📊 Complete Scoring System
- Full accuracy calculation (300s, 100s, 50s, Misses)
- Combo tracking and multipliers
- Comprehensive result screen with statistics

---


---

## Hosting (Advertisement)

[![Nexo Systems — Cheap & Fair Hosting in Europe](https://nexo.systems/assets/media/branding/nexosystems-light.svg)](https://nexo.systems/a/justinsanjp)

**Cheap & Fair Hosting in Europe — Nexo Systems**  
If you are looking for affordable and reliable hosting within Europe, consider checking out **Nexo Systems** via the link above.

**Disclaimer:** This project is **not officially partnered** with Nexo Systems. I personally participate in the **Nexo Systems affiliate program**. If you sign up using the link above, I may receive a small commission at no additional cost to you. This recommendation is based on personal experience and does not represent an official partnership or endorsement.

---

## Become a Partner / Supporter

If you would like to support this project or be listed as a partner/supporter, you can do so by simply opening a new **GitHub Issue**.

Please create an issue with the title:  
**`Partner/Supporter: <Your Name or Organization>`**

**Suggested Issue Template (copy & paste):**

# Partner / Supporter Request

**Name / Organization:**  
**Type of Support:** (e.g. hosting, financial support, development, testing, other)  
**Website / Contact:**  
**Short Description of Support:**  
**Optional: Logo URL for README listing:**  
**Notes / Conditions:**

---



## 🚀 Tech Stack

| Component | Technology |
|-----------|-----------|
| **Language** | TypeScript / JavaScript (ES6+) |
| **Frontend Framework** | React 19 |
| **Styling** | Tailwind CSS + CSS3 |
| **Markup** | HTML5 |
| **Archive Handling** | [JSZip](https://stuk.github.io/jszip/) for .osz parsing |
| **Audio Processing** | Web Audio API |
| **Build Tool** | Vite (or your configured build system) |

---

## 🛠️ Installation & Setup

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm**, **pnpm**, or **yarn** package manager
- **Git**

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/justinsanjp/osuwebengine.git
   cd osuwebengine
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or: pnpm install / yarn install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The dev server will start at `http://localhost:5173` (or another available port).

4. **Open your browser:**
   Navigate to the URL shown in your terminal and enjoy! 🎮

### Production Build

To build for production:
```bash
npm run build
```

Preview the production build locally:
```bash
npm run preview
```

---

## 📁 Project Structure

```
osuwebengine/
├── src/
│   ├── App.tsx                    # Root React component
│   ├── index.tsx                  # React application entry point
│   ├── index.html                 # HTML template
│   ├── constants.ts               # Game constants & configuration
│   ├── types.ts                   # TypeScript type definitions
│   ├── metadata.json              # Project metadata
│   ├── components/
│   │   └── GameCanv...            # Game canvas React component
│   └── utils/
│       ├── beatmapPa...           # Beatmap parser logic
│       └── gameLogic.ts           # Core game engine logic
├── package.json                   # Project dependencies & scripts
├── vite.config.ts                 # Vite build configuration
├── tsconfig.json                  # TypeScript configuration
├── LICENSE.md                      # Custom JOWE-CL License
└── README.md                       # This file
```

### Key Files Explained

- **App.tsx**: Main React component managing game state and UI
- **index.tsx**: Entry point that mounts React app to the DOM
- **constants.ts**: Game constants (hit windows, AR/CS formulas, etc.)
- **types.ts**: TypeScript interfaces for Beatmap, HitObject, GameState, etc.
- **GameCanvas.tsx**: React component rendering the game field using Canvas API
- **beatmapParser.ts**: Utility to parse `.osu` file format and extract metadata
- **gameLogic.ts**: Core engine containing timing calculations and hit detection

---

## 🎮 How It Works

### Beatmap Loading
1. User uploads or drag-drops a `.osz` file
2. JSZip extracts the compressed archive
3. The engine parses the `.osu` metadata file using `beatmapParser.ts`
4. Audio and background assets are loaded asynchronously

### Gameplay Loop
1. **Audio Sync**: Web Audio API provides frame-accurate timing via `AudioContext.currentTime`
2. **Hit Detection**: GameCanvas renders circles and evaluates clicks against `gameLogic.ts`
3. **Scoring**: Accuracy is calculated in real-time and displayed
4. **Result Screen**: Final statistics are shown after completion

### Timing Accuracy
- Uses `AudioContext.currentTime` for precise audio synchronization
- Frame-perfect hit registration with configurable hit windows (defined in `constants.ts`)
- Automatic correction for system latency

---

## ⚙️ Configuration

Game behavior is centralized in `constants.ts` and `types.ts`. TypeScript ensures type safety:

```typescript
// constants.ts - Hit windows configuration
export const HIT_WINDOWS = {
  perfect: 50,    // ±50ms for 300
  good: 100,      // ±100ms for 100
  ok: 150         // ±150ms for 50
};

// Approach Rate formula
export const calculateApproachRate = (ar: number): number => {
  // Official Osu! AR calculation
};
```

Adjust these values in `constants.ts` to customize gameplay difficulty and timing windows.

---

## 🐛 Known Limitations

- **Slider Ticks**: Slider tick scoring is currently simplified
- **Spinners**: Spinner mechanics require additional work
- **Sound Effects**: Hitsounds are not yet implemented
- **Multiplayer**: This is a single-player experience

---

## 🤝 Contributing

Contributions are welcome! Whether you're fixing bugs, adding features, or improving documentation:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Development Tips:**
- Check TypeScript types are correct before submitting
- Follow the existing code style and patterns
- Add comments explaining complex game logic
- Test with various beatmaps and difficulty levels
- **Important**: Review the LICENSE.md to ensure your contributions comply with the JOWE-CL license

---

## 📄 License

This project is licensed under the **Justin's Osu! Web Engine - Custom License (JOWE-CL v1.0)**.

### Key License Terms:
- ✅ **Free to use and distribute** (non-commercial)
- ✅ **Free to modify and fork** (with restrictions)
- ✅ **Open source on GitHub**

### Important Restrictions:
- ❌ **No monetization** - You cannot earn money from this project
- ❌ **No false attribution** - You must not claim this as your own
- ❌ **No removal of branding** - Original branding and GitHub links must be preserved
- ❌ **No in-app purchases** - Adding monetization features is prohibited
- ❌ **No prohibited content** - Political, racist, or fascist content is strictly forbidden
- ❌ **Hosting restrictions** - Cannot be hosted in Russia, Iran, North Korea, Iraq, Israel, or Saudi Arabia
- ❌ **Usage restrictions** - Usage is prohibited in North Korea and Israel

**If you fork this project**, you must include a popup or dropdown menu allowing users to choose between the original GitHub link and your fork.

For complete license details, see [LICENSE.md](LICENSE.md).

---

## 📋 Disclaimer

This is a **fan-made project** and is **not affiliated** with Osu! or ppy Pty Ltd. All rights to the original Osu! game concept belong to their respective owners. This project is created for educational and entertainment purposes only.

**Osu!** is a trademark of ppy Pty Ltd.

---

## 👤 About

Developed with 💖 by **Justinsanjp** (justinさん)

- GitHub: [@justinsanjp](https://github.com/justinsanjp)
- Original Repository: [github.com/justinsanjp/osuwebengine](https://github.com/justinsanjp/osuwebengine)
- Questions or feedback? Feel free to open an issue!

---

## 🙏 Acknowledgments

- [ppy](https://ppy.sh/) for creating the original Osu!
- [React](https://react.dev) team for the fantastic framework
- [TypeScript](https://www.typescriptlang.org/) for type safety and excellent developer experience
- [Tailwind CSS](https://tailwindcss.com) for utility-first styling
- [JSZip](https://stuk.github.io/jszip/) for archive handling
- [Vite](https://vitejs.dev/) for fast build tooling
- The Osu! community for inspiration and support

---

**Last Updated**: December 2025  
**License**: JOWE-CL v1.0 | [View Full License](LICENSE.md)
