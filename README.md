# PiGen — Media Generation Extensions for Pi

Pi extensions for generating repo-aware media assets — videos, images, voiceovers, music — using AI generation APIs.

> **Presentation-first by default.** Image generation is tuned for **slide decks, explainer videos, and illustrated docs** (16:9 framing, editorial-illustration style, slide-ready negative space). Marketing assets (hero, social) are still supported but are no longer the default. The aesthetic draws from the illustration-led style of [plannotator/effective-html](https://github.com/plannotator/effective-html), [tmchow/illo-skill](https://github.com/tmchow/illo-skill), [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master), [nexu-io/html-video](https://github.com/nexu-io/html-video), and [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes).

## Extensions

### `repo-media`

Generates project media from repo context. Pi already knows your codebase; this extension turns that knowledge into polished assets.

**Image asset types — Slides & illustrations (default, 16:9):**
- 🖼 `slide_cover` — title-slide hero with bold focal subject and headline-friendly composition
- 🎨 `slide_illustration` — editorial explainer illustration (like `effective-html` or `illo-skill`)
- 🔢 `step_diagram` — numbered, sequential flow illustration (1 → 2 → 3)
- 💡 `concept_diagram` — explanatory concept art in editorial style
- 🎞 `frame` — a single storyboard / video-sequence frame (like `html-video` or `hyperframes`)

**Image asset types — Docs & social (marketing):**
- 🧱 `architecture_diagram` — clean technical diagram, isometric, dark theme
- 🪧 `hero_image` — GitHub README hero banner (16:9)
- 📣 `social_asset` — 1:1, 16:9, or 9:16 social card

**Other assets:**
- 🎬 `video_explainer`, `feature_showcase`, `screenshot_animation`
- 🎙 `voiceover`
- 🎵 `background_music`

**Tools:**
- `generate_media` — Generate a single asset (pass `asset_type`, `prompt`, optional `target`, `style`, `aspect_ratio`)
- `generate_media_suite` — Batch generate a full media kit

**Commands:**
- `/media` — Interactive wizard (asset types grouped: Slides & illustrations → Videos → Audio → Docs & social → Custom)
- `/media suite` — Generate a slide-deck-ready suite by default
- `/media list` — List generated media
- `/media clean` — Delete generated media

**Providers:**
- ✅ MiniMax (image, speech, music, video)
- 🔜 Replicate, Runway, ElevenLabs, OpenAI DALL-E (future)

## Setup

### Install via Pi (recommended)

```bash
pi install git:github.com/GeneGulanesJr/PiGen
```

Or try without installing:

```bash
pi -e git:github.com/GeneGulanesJr/PiGen
```

### Manual Install

Copy or symlink the extension to Pi's global extensions directory:

```bash
ln -s /path/to/PiGen/repo-media ~/.pi/agent/extensions/repo-media
```

### Configure API Key

The extension uses the **same MiniMax API key that Pi uses** for text generation. If MiniMax works for text in your Pi, the extension works automatically — no extra configuration needed.

If you haven't set up MiniMax yet:

1. Run `/login` in Pi and authenticate with MiniMax
2. Or set `MINIMAX_API_KEY` environment variable

## Usage

Ask Pi to generate media for your repo. The image generation is **slide-deck and illustration focused** by default.

**Slide-deck & illustration examples:**
```
"Generate a slide cover for the context injection feature"
"Create a step diagram showing how the memory layer works"
"Make 3 slide illustrations for the agent loop walkthrough"
"Generate a concept diagram for the new search system"
"Make a single storyboard frame for the intro of our explainer video"
```

**Full slide-deck suite:**
```
"Make me a full media suite for the context injection feature"
```

This produces, by default:
- `slide-01-cover.jpeg` (16:9) — title-slide hero
- `slide-02-overview.jpeg` (16:9) — editorial explainer illustration
- `slide-03-how-it-works.jpeg` (16:9) — numbered step diagram
- `slide-04-deep-dive.jpeg` (16:9) — concept art
- `voiceover.mp3` — narration
- `background-music.mp3` — subtle background track

**Marketing / docs examples (override the presentation default):**
```
"Generate a hero image for the GitHub README"          # 16:9 banner
"Create a 1:1 social card for the launch"              # 1:1 social
"Make an architecture diagram of the memory layer"     # iso, dark, labeled
```

**Other assets:**
```
"Generate a feature showcase video for the new search system"
"Make a background music track for the explainer"
"Generate a 60-second voiceover introducing the project"
```

Output goes to `./repo-media/{target-slug}/` in your project directory.

## Development

```
PiGen/
├── repo-media/
│   ├── index.ts              # Entry point
│   ├── providers/
│   │   ├── types.ts          # Provider interfaces + asset-type registry
│   │   └── minimax.ts        # MiniMax provider
│   ├── tools/
│   │   ├── generate.ts       # generate_media tool
│   │   └── generate_suite.ts # generate_media_suite tool
│   ├── wizard.ts             # Interactive wizard (/media command)
│   └── package.json          # Extension metadata
├── docs/
│   └── superpowers/specs/    # Design specs
└── README.md
```

### Adding new asset types

Image asset types are defined in `repo-media/providers/types.ts`:

- Add to `ASSET_CAPABILITY_MAP` (capability is `image` for all image types)
- Add to `VALID_ASSET_TYPES` (in the order you want them to appear in the wizard)
- Add to `ASSET_EXTENSIONS` (typically `jpeg` for images)
- Add to `DEFAULT_ASPECT_RATIOS` (16:9 is the slide-native default)
- Add to `ALLOWED_ASPECT_RATIOS` (the ratios the wizard's aspect picker will offer)
- Add a category entry in `ASSET_TYPE_CATEGORIES` if you want it grouped in the wizard picker
- Add a prompt template in `ASSET_PROMPT_TEMPLATES` in `tools/generate_suite.ts` (so the default suite uses it)
- Add a `promptGuidelines` entry in `tools/generate.ts` (so the LLM knows how to compose prompts)

## Design Spec

See [design spec](docs/superpowers/specs/2026-06-05-repo-media-gen-design.md) for full architecture details.
