/**
 * Provider type contracts for media generation.
 */

export type Capability = "image" | "speech" | "music" | "video";

export interface MediaProvider {
  name: string;
  capabilities: Capability[];
  image?: ImageProvider;
  speech?: SpeechProvider;
  music?: MusicProvider;
  video?: VideoProvider;
}

export interface ImageParams {
  prompt: string;
  model: string;
  aspectRatio?: string;
  /** Negative prompt — things the model should NOT generate (passed through to providers that support it). */
  negativePrompt?: string;
  subjectReference?: { type: string; image: string[] };
}

export interface SpeechParams {
  text: string;
  model: string;
  voiceId: string;
  speed?: number;
  pitch?: number;
  languageBoost?: string;
  format?: string;
  pronunciationDict?: { tone: string[] };
}

export interface MusicParams {
  prompt: string;
  model: string;
  lyrics?: string;
  lyricsOptimizer?: boolean;
  isInstrumental?: boolean;
  referenceAudioUrl?: string;
  format?: string;
}

export interface VideoParams {
  prompt: string;
  model: string;
  mode: "text" | "image" | "first_last" | "subject";
  duration: number;
  resolution: string;
  firstFrameImage?: string;
  lastFrameImage?: string;
  subjectImage?: string;
  promptOptimizer?: boolean;
}

export interface MediaResult {
  data: Buffer;
  format: string;
  metadata?: Record<string, unknown>;
}

export interface VideoStatus {
  status: "processing" | "success" | "failed";
  fileId?: string;
  error?: string;
}

export interface ImageProvider {
  generate(params: ImageParams): Promise<MediaResult>;
  supportedModels(): string[];
}

export interface SpeechProvider {
  generate(params: SpeechParams): Promise<MediaResult>;
  supportedModels(): string[];
  listVoices(): string[];
}

export interface MusicProvider {
  generate(params: MusicParams): Promise<MediaResult>;
  supportedModels(): string[];
}

export interface VideoProvider {
  submit(params: VideoParams): Promise<string>;
  poll(taskId: string): Promise<VideoStatus>;
  download(fileId: string): Promise<Buffer>;
  supportedModels(): string[];
}

/**
 * Asset type → provider capability mapping
 *
 * Image asset types are grouped into two intents:
 *   - Presentation / illustration (slide_*, step_*, concept_*, frame)
 *       Optimized for slide decks, explainer videos, illustrated docs.
 *       See defaults: 16:9, illustration-friendly aspect ratios.
 *   - Marketing (hero_image, social_asset, architecture_diagram)
 *       Optimized for GitHub READMEs, social posts, technical diagrams.
 */
export const ASSET_CAPABILITY_MAP: Record<string, Capability> = {
  // Video
  video_explainer: "video",
  feature_showcase: "video",
  screenshot_animation: "video",
  // Audio
  voiceover: "speech",
  background_music: "music",
  // Images — presentation / illustration (slide-deck focus)
  slide_cover: "image",
  slide_illustration: "image",
  step_diagram: "image",
  concept_diagram: "image",
  frame: "image",
  // Images — marketing / docs
  architecture_diagram: "image",
  hero_image: "image",
  social_asset: "image",
  // "custom" requires explicit model param to determine capability
};

export const VALID_ASSET_TYPES = [
  // Video
  "video_explainer",
  "feature_showcase",
  "screenshot_animation",
  // Audio
  "voiceover",
  "background_music",
  // Images — presentation / illustration
  "slide_cover",
  "slide_illustration",
  "step_diagram",
  "concept_diagram",
  "frame",
  // Images — marketing / docs
  "architecture_diagram",
  "hero_image",
  "social_asset",
  // Escape hatch
  "custom",
] as const;

export type AssetType = (typeof VALID_ASSET_TYPES)[number];

/** Presentation / illustration focused image asset types (16:9 slide-native) */
export const PRESENTATION_IMAGE_TYPES: ReadonlySet<AssetType> = new Set([
  "slide_cover",
  "slide_illustration",
  "step_diagram",
  "concept_diagram",
  "frame",
]);

/** Asset-type category labels — used by the wizard and the suite picker */
export const ASSET_TYPE_CATEGORIES: Record<string, AssetType[]> = {
  "Slides & illustrations": [
    "slide_cover",
    "slide_illustration",
    "step_diagram",
    "concept_diagram",
    "frame",
  ],
  Videos: ["video_explainer", "feature_showcase", "screenshot_animation"],
  Audio: ["voiceover", "background_music"],
  "Docs & social": ["architecture_diagram", "hero_image", "social_asset"],
  "Custom (specify model)": ["custom"],
};

export const ASSET_EXTENSIONS: Record<string, string> = {
  video_explainer: "mp4",
  feature_showcase: "mp4",
  screenshot_animation: "mp4",
  voiceover: "mp3",
  background_music: "mp3",
  // Presentation / illustration
  slide_cover: "jpeg",
  slide_illustration: "jpeg",
  step_diagram: "jpeg",
  concept_diagram: "jpeg",
  frame: "jpeg",
  // Marketing / docs
  architecture_diagram: "jpeg",
  hero_image: "jpeg",
  social_asset: "jpeg",
  custom: "mp4",
};

export const DEFAULT_MODELS: Record<string, string> = {
  image: "image-01",
  speech: "speech-2.8-hd",
  music: "music-2.6",
  video: "MiniMax-Hailuo-2.3",
};

export const DEFAULT_RESOLUTIONS: Record<string, string> = {
  video_explainer: "768p",
  feature_showcase: "1080p",
  screenshot_animation: "768p",
};

/**
 * Default aspect ratios per asset type.
 *
 * Image asset types fall back to "16:9" — the universal slide / YouTube /
 * GitHub README aspect ratio — so any new illustration type works out of
 * the box for slide-deck use cases. Override per-call via the tool param.
 */
export const DEFAULT_ASPECT_RATIOS: Record<string, string> = {
  // Presentation / illustration — all 16:9 by default (slide-native)
  slide_cover: "16:9",
  slide_illustration: "16:9",
  step_diagram: "16:9",
  concept_diagram: "16:9",
  frame: "16:9",
  // Marketing / docs
  architecture_diagram: "16:9",
  hero_image: "16:9",
  social_asset: "1:1",
};

/**
 * Allowed aspect ratios per asset type. Image providers typically only
 * support a fixed set; this list is used by the wizard to offer a sane
 * picker. Anything not listed falls back to the asset's default.
 */
export const ALLOWED_ASPECT_RATIOS: Record<string, string[]> = {
  // Presentation / illustration — designed to flex across formats
  slide_cover: ["16:9", "4:3", "3:2", "9:16"],
  slide_illustration: ["16:9", "4:3", "3:2"],
  step_diagram: ["16:9", "4:3", "1:1"],
  concept_diagram: ["16:9", "4:3", "3:2", "1:1"],
  frame: ["16:9", "9:16", "1:1", "4:3"],
  // Marketing / docs
  architecture_diagram: ["16:9", "4:3", "3:2"],
  hero_image: ["16:9", "3:1", "2:1"],
  social_asset: ["1:1", "16:9", "9:16", "4:5"],
};
