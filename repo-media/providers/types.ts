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
 */
export const ASSET_CAPABILITY_MAP: Record<string, Capability> = {
  video_explainer: "video",
  feature_showcase: "video",
  architecture_diagram: "image",
  screenshot_animation: "video",
  voiceover: "speech",
  background_music: "music",
  hero_image: "image",
  social_asset: "image",
  // "custom" requires explicit model param to determine capability
};

export const VALID_ASSET_TYPES = [
  "video_explainer",
  "feature_showcase",
  "architecture_diagram",
  "screenshot_animation",
  "voiceover",
  "background_music",
  "hero_image",
  "social_asset",
  "custom",
] as const;

export type AssetType = (typeof VALID_ASSET_TYPES)[number];

export const ASSET_EXTENSIONS: Record<string, string> = {
  video_explainer: "mp4",
  feature_showcase: "mp4",
  architecture_diagram: "jpeg",
  screenshot_animation: "mp4",
  voiceover: "mp3",
  background_music: "mp3",
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

export const DEFAULT_ASPECT_RATIOS: Record<string, string> = {
  architecture_diagram: "16:9",
  hero_image: "16:9",
  social_asset: "1:1",
};
