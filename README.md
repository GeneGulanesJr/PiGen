# PiGen — Media Generation Extensions for Pi

Pi extensions for generating repo-aware media assets — videos, images, voiceovers, music — using AI generation APIs.

## Extensions

### `repo-media`

Generates project media from repo context. Pi already knows your codebase; this extension turns that knowledge into polished assets.

**Asset types:**
- 🎬 Video explainers & feature showcases
- 🖼 Architecture diagrams, hero images, social assets
- 🎙 Voiceover narration
- 🎵 Background music

**Tools:**
- `generate_media` — Generate a single asset
- `generate_media_suite` — Batch generate a full media kit

**Commands:**
- `/media` — Interactive wizard
- `/media suite` — Generate full suite
- `/media list` — List generated media
- `/media clean` — Delete generated media

**Providers:**
- ✅ MiniMax (image, speech, music, video)
- 🔜 Replicate, Runway, ElevenLabs, OpenAI DALL-E (future)

## Setup

### Install

Copy or symlink the extension to Pi's global extensions directory:

```bash
ln -s /path/to/PiGen/repo-media ~/.pi/agent/extensions/repo-media
```

### Configure API Key

Set the environment variable for your provider:

```bash
export MINIMAX_API_KEY="your-key-here"
```

Or add a MiniMax provider to `~/.pi/agent/models.json` — the extension will pick up the key automatically.

## Usage

Ask Pi to generate media for your repo:

```
"Generate a feature showcase video for the new search system"
"Create an architecture diagram of the memory layer"
"Generate a hero image for the GitHub README"
"Make me a full media suite for the context injection feature"
```

Output goes to `./repo-media/` in your project directory.

## Development

```
PiGen/
├── repo-media/
│   ├── index.ts              # Entry point
│   ├── providers/
│   │   ├── types.ts          # Provider interfaces
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

## Design Spec

See [design spec](docs/superpowers/specs/2026-06-05-repo-media-gen-design.md) for full architecture details.
