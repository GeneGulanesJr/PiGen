/**
 * MiniMax provider implementation.
 *
 * Handles image, speech, music, and video generation via MiniMax API.
 */

import type {
  MediaProvider,
  ImageProvider,
  ImageParams,
  SpeechProvider,
  SpeechParams,
  MusicProvider,
  MusicParams,
  VideoProvider,
  VideoParams,
  MediaResult,
  VideoStatus,
} from "./types.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MINIMAX_BASE_URL = "https://api.minimax.io";

// --- API Key Resolution ---
// Pi stores API keys in ~/.pi/agent/auth.json (set via /login).
// We read from there first, then fall back to MINIMAX_API_KEY env var.

let resolvedApiKey: string | undefined;

/** Called from index.ts with API key resolved from Pi's auth store */
export function setApiKey(key: string): void {
  resolvedApiKey = key;
}

function getApiKeyFromAuthJson(): string | undefined {
  try {
    const authPath = join(homedir(), ".pi", "agent", "auth.json");
    const raw = readFileSync(authPath, "utf-8");
    const auth = JSON.parse(raw);
    return auth?.minimax?.key;
  } catch {
    return undefined;
  }
}

function getApiKey(): string | undefined {
  // Priority: explicit set > Pi's auth.json > env var
  return resolvedApiKey ?? getApiKeyFromAuthJson() ?? process.env.MINIMAX_API_KEY;
}

function requireApiKey(): string {
  const key = getApiKey();
  if (!key) {
    throw new Error(
      "No MiniMax API key found. Run /login in Pi to authenticate with MiniMax, " +
      "or set MINIMAX_API_KEY env var."
    );
  }
  return key;
}

// --- HTTP Helpers ---

async function minimaxPost(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Response> {
  const apiKey = requireApiKey();
  const response = await fetch(`${MINIMAX_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `MiniMax API error (${response.status}): ${text || response.statusText}`
    );
  }

  return response;
}

async function minimaxGet(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<Response> {
  const apiKey = requireApiKey();
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${MINIMAX_BASE_URL}${path}?${qs}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `MiniMax API error (${response.status}): ${text || response.statusText}`
    );
  }

  return response;
}

// --- Image Provider ---

class MiniMaxImageProvider implements ImageProvider {
  supportedModels(): string[] {
    return ["image-01"];
  }

  async generate(params: ImageParams): Promise<MediaResult> {
    const body: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio ?? "1:1",
      response_format: "base64",
    };

    if (params.subjectReference) {
      body.subject_reference = params.subjectReference;
    }

    const response = await minimaxPost("/v1/image_generation", body);
    const data = (await response.json()) as {
      data: { image_base64: string[] };
    };

    // Return first image
    const base64 = data.data.image_base64[0];
    if (!base64) {
      throw new Error("MiniMax returned no image data");
    }

    return {
      data: Buffer.from(base64, "base64"),
      format: "jpeg",
    };
  }
}

// --- Speech Provider ---

class MiniMaxSpeechProvider implements SpeechProvider {
  supportedModels(): string[] {
    return [
      "speech-2.8-hd",
      "speech-2.8-turbo",
      "speech-2.6-hd",
      "speech-2.6-turbo",
    ];
  }

  listVoices(): string[] {
    // TODO: Fetch from API or use known voice list
    return ["English_expressive_narrator", "Chinese_female_gentle"];
  }

  async generate(params: SpeechParams): Promise<MediaResult> {
    const body: Record<string, unknown> = {
      model: params.model,
      text: params.text,
      stream: false,
      output_format: "hex",
      voice_setting: {
        voice_id: params.voiceId,
        speed: params.speed ?? 1,
        vol: 1,
        pitch: params.pitch ?? 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: params.format ?? "mp3",
        channel: 1,
      },
    };

    if (params.languageBoost) {
      body.language_boost = params.languageBoost;
    }

    if (params.pronunciationDict) {
      body.pronunciation_dict = params.pronunciationDict;
    }

    const response = await minimaxPost("/v1/t2a_v2", body);
    const data = (await response.json()) as {
      data: { audio: string };
      extra_info: { audio_format: string };
    };

    return {
      data: Buffer.from(data.data.audio, "hex"),
      format: params.format ?? "mp3",
      metadata: {
        audioLength: (data.extra_info as Record<string, unknown>)
          ?.audio_length,
      },
    };
  }
}

// --- Music Provider ---

class MiniMaxMusicProvider implements MusicProvider {
  supportedModels(): string[] {
    return ["music-2.6", "music-cover"];
  }

  async generate(params: MusicParams): Promise<MediaResult> {
    const body: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      output_format: "hex",
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: params.format ?? "mp3",
      },
    };

    if (params.lyrics) {
      body.lyrics = params.lyrics;
    }

    if (params.lyricsOptimizer) {
      body.lyrics_optimizer = true;
    }

    if (params.isInstrumental) {
      body.is_instrumental = true;
    }

    if (params.referenceAudioUrl) {
      body.audio_url = params.referenceAudioUrl;
    }

    const response = await minimaxPost("/v1/music_generation", body);
    const data = (await response.json()) as {
      data: { audio: string };
      extra_info: { music_duration: number };
    };

    return {
      data: Buffer.from(data.data.audio, "hex"),
      format: params.format ?? "mp3",
      metadata: {
        duration: data.extra_info?.music_duration,
      },
    };
  }
}

// --- Video Provider ---

class MiniMaxVideoProvider implements VideoProvider {
  supportedModels(): string[] {
    return [
      "MiniMax-Hailuo-2.3",
      "MiniMax-Hailuo-2.3-Fast",
      "MiniMax-Hailuo-02",
    ];
  }

  async submit(params: VideoParams): Promise<string> {
    const body: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      duration: params.duration,
      resolution: params.resolution,
    };

    if (params.promptOptimizer !== undefined) {
      body.prompt_optimizer = params.promptOptimizer;
    }

    // Determine mode from params
    if (params.subjectImage) {
      body.subject_reference = [
        { type: "character", image: [params.subjectImage] },
      ];
    } else if (params.lastFrameImage) {
      body.first_frame_image = params.firstFrameImage;
      body.last_frame_image = params.lastFrameImage;
    } else if (params.firstFrameImage) {
      body.first_frame_image = params.firstFrameImage;
    }

    const response = await minimaxPost("/v1/video_generation", body);
    const data = (await response.json()) as { task_id: string };

    return data.task_id;
  }

  async poll(taskId: string): Promise<VideoStatus> {
    const response = await minimaxGet("/v1/query/video_generation", {
      task_id: taskId,
    });
    const data = (await response.json()) as {
      status: string;
      file_id?: string;
      error_message?: string;
    };

    if (data.status === "Success") {
      return { status: "success", fileId: data.file_id };
    }
    if (data.status === "Fail") {
      return {
        status: "failed",
        error: data.error_message ?? "Unknown error",
      };
    }
    return { status: "processing" };
  }

  async download(fileId: string): Promise<Buffer> {
    const response = await minimaxGet("/v1/files/retrieve", {
      file_id: fileId,
    });
    const data = (await response.json()) as {
      file: { download_url: string };
    };

    const download = await fetch(data.file.download_url);
    if (!download.ok) {
      throw new Error(`Failed to download video: ${download.statusText}`);
    }

    const arrayBuffer = await download.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

// --- Provider Loader ---

export function loadProviders(): MediaProvider[] {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  return [
    {
      name: "minimax",
      capabilities: ["image", "speech", "music", "video"],
      image: new MiniMaxImageProvider(),
      speech: new MiniMaxSpeechProvider(),
      music: new MiniMaxMusicProvider(),
      video: new MiniMaxVideoProvider(),
    },
  ];
}
