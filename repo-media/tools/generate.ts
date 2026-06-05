/**
 * generate_media tool — Generate a single media asset for the current repo.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { MediaProvider, Capability } from "../providers/types.js";
import {
  VALID_ASSET_TYPES,
  ASSET_CAPABILITY_MAP,
  ASSET_EXTENSIONS,
  DEFAULT_MODELS,
  DEFAULT_RESOLUTIONS,
  DEFAULT_ASPECT_RATIOS,
} from "../providers/types.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { format } from "node:util";

const ASSET_TYPE_ENUM = [
  ...VALID_ASSET_TYPES,
] as unknown as readonly string[];

export function registerGenerateMediaTool(
  pi: ExtensionAPI,
  providers: MediaProvider[]
) {
  pi.registerTool({
    name: "generate_media",
    label: "Generate Media",
    description:
      "Generate a single media asset (video, image, voiceover, or music) for the current repo. " +
      "The prompt should be the final generation-ready description — craft it using repo context before calling. " +
      "Outputs to ./repo-media/{target-slug}/ by default.",
    promptSnippet:
      "Generate repo media assets — videos, images, voiceovers, music",
    promptGuidelines: [
      "Use generate_media to create visual and audio assets for the repo.",
      "The prompt parameter is the FINAL generation-ready prompt — write it using repo context before calling the tool.",
      "For video_explainer: describe step-by-step animated walkthroughs with camera commands like [Pan left], [Zoom in].",
      "For feature_showcase: describe dynamic demonstrations with [Tracking shot] for reveals.",
      "For architecture_diagram: describe clean technical diagrams, isometric view, dark theme, labeled components.",
      "For screenshot_animation: describe smooth pan/zoom with [Push in] and [Pan] commands. Requires reference_image.",
      "For voiceover: the prompt IS the narration text. Use interjection tags like (sighs), (breaths) for natural delivery.",
      "For background_music: describe style, mood, instrumentation — keep it subtle and suitable for technical videos.",
      "For hero_image: describe professional hero banners for GitHub READMEs, specify 16:9 aspect ratio.",
      "For social_asset: describe eye-catching social media previews with bold layout.",
      "For custom: specify a model explicitly to determine which generation capability to use.",
      "Always specify asset_type — it determines which provider capability (image, speech, music, video) to use.",
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description:
          "Final generation-ready prompt. Write this using repo context before calling.",
      }),
      asset_type: StringEnum(ASSET_TYPE_ENUM, {
        description:
          "Type of media asset to generate. Determines which provider capability to use.",
      }),
      model: Type.Optional(
        Type.String({
          description:
            "Provider model ID. Default: best quality per provider capability.",
        })
      ),
      target: Type.Optional(
        Type.String({
          description:
            "What part of the repo this covers. Used for output subdirectory.",
        })
      ),
      provider: Type.Optional(
        Type.String({
          description: "Provider name. Default: first available.",
        })
      ),
      style: Type.Optional(
        StringEnum(
          ["professional", "playful", "minimal", "cinematic"] as const,
          {
            description:
              "Visual style. The LLM should incorporate style cues into the prompt before calling.",
          }
        )
      ),
      duration: Type.Optional(
        Type.Number({
          description: "Duration in seconds. Video: 6 or 10.",
        })
      ),
      resolution: Type.Optional(
        Type.String({
          description: "Resolution: 720p, 768p, or 1080p.",
        })
      ),
      voice_id: Type.Optional(
        Type.String({
          description:
            "Voice ID for speech. Default: English_expressive_narrator.",
        })
      ),
      reference_image: Type.Optional(
        Type.String({
          description:
            "URL or local path for image-to-video or subject reference.",
        })
      ),
      output_name: Type.Optional(
        Type.String({
          description: "Filename without extension. Default: auto-generated.",
        })
      ),
      output_dir: Type.Optional(
        Type.String({
          description:
            "Output directory. Default: ./repo-media/{target-slug}/.",
        })
      ),
      confirm: Type.Optional(
        Type.Boolean({
          description:
            "Show confirmation before generating. Default: true. Set false to skip.",
        })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { asset_type } = params;

      // Resolve capability
      let capability: Capability;
      if (asset_type === "custom") {
        if (!params.model) {
          throw new Error(
            "For custom asset type, specify a model to determine the generation capability."
          );
        }
        // Infer capability from model name
        capability = inferCapabilityFromModel(params.model);
      } else {
        capability = ASSET_CAPABILITY_MAP[asset_type];
      }

      // Find provider
      const provider = resolveProvider(providers, capability, params.provider);
      if (!provider) {
        throw new Error(
          `No provider available for ${capability} generation. ` +
            `Set MINIMAX_API_KEY env var or configure a provider.`
        );
      }

      // Resolve defaults
      const model =
        params.model ?? DEFAULT_MODELS[capability] ?? "image-01";
      const resolution =
        params.resolution ?? DEFAULT_RESOLUTIONS[asset_type] ?? "768p";
      const aspectRatio =
        DEFAULT_ASPECT_RATIOS[asset_type] ?? "1:1";
      const ext = ASSET_EXTENSIONS[asset_type] ?? "mp4";

      // Build output path
      const targetSlug = params.target
        ? slugify(params.target)
        : undefined;
      const outputDir =
        params.output_dir ??
        (targetSlug
          ? `./repo-media/${targetSlug}/`
          : "./repo-media/");
      const outputName =
        params.output_name ?? `${asset_type}-${timestamp()}`;
      const outputPath = resolve(ctx.cwd, outputDir, `${outputName}.${ext}`);

      // Confirmation
      const shouldConfirm = params.confirm !== false;
      if (shouldConfirm && ctx.hasUI) {
        const details = [
          `Asset: ${asset_type}`,
          `Model: ${model}`,
        ];
        if (["video", "image"].includes(capability)) {
          details.push(
            capability === "video"
              ? `Duration: ${params.duration ?? 6}s, Resolution: ${resolution}`
              : `Aspect: ${aspectRatio}`
          );
        }
        details.push(`Output: ${outputPath}`);

        const ok = await ctx.ui.confirm(
          "Generate Media?",
          details.join("\n")
        );
        if (!ok) {
          return {
            content: [{ type: "text", text: "Generation cancelled." }],
            details: { cancelled: true },
          };
        }
      }

      // Progress
      onUpdate?.({
        content: [{ type: "text", text: `Generating ${asset_type}...` }],
      });

      try {
        let resultData: Buffer;
        let resultFormat: string;

        switch (capability) {
          case "image": {
            const imgResult = await provider.image!.generate({
              prompt: params.prompt,
              model,
              aspectRatio:
                asset_type === "social_asset" ? aspectRatio : undefined,
            });
            resultData = imgResult.data;
            resultFormat = imgResult.format;
            break;
          }
          case "speech": {
            const speechResult = await provider.speech!.generate({
              text: params.prompt,
              model,
              voiceId: params.voice_id ?? "English_expressive_narrator",
              format: "mp3",
            });
            resultData = speechResult.data;
            resultFormat = speechResult.format;
            break;
          }
          case "music": {
            const musicResult = await provider.music!.generate({
              prompt: params.prompt,
              model,
              format: "mp3",
            });
            resultData = musicResult.data;
            resultFormat = musicResult.format;
            break;
          }
          case "video": {
            // Video is async — submit, poll, download
            const videoProvider = provider.video!;
            const videoMode =
              asset_type === "screenshot_animation" ? "image" : "text";

            onUpdate?.({
              content: [
                { type: "text", text: `Submitting video generation task...` },
              ],
            });

            const taskId = await videoProvider.submit({
              prompt: params.prompt,
              model,
              mode: videoMode,
              duration: params.duration ?? 6,
              resolution,
              firstFrameImage:
                videoMode === "image" ? params.reference_image : undefined,
              promptOptimizer: true,
            });

            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `Task submitted (ID: ${taskId}). Polling for completion...`,
                },
              ],
            });

            // Poll every 10s
            let status = await videoProvider.poll(taskId);
            while (status.status === "processing") {
              await sleep(10000, signal);
              status = await videoProvider.poll(taskId);
              onUpdate?.({
                content: [
                  {
                    type: "text",
                    text: `Video processing... (task: ${taskId})`,
                  },
                ],
              });
            }

            if (status.status === "failed") {
              throw new Error(
                `Video generation failed: ${status.error ?? "Unknown error"}`
              );
            }

            onUpdate?.({
              content: [
                { type: "text", text: `Downloading video file...` },
              ],
            });

            resultData = await videoProvider.download(status.fileId!);
            resultFormat = "mp4";
            break;
          }
          default:
            throw new Error(`Unsupported capability: ${capability}`);
        }

        // Save file
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, resultData);

        const sizeKB = Math.round(resultData.length / 1024);

        return {
          content: [
            {
              type: "text",
              text: `✓ ${asset_type} generated successfully.\n` +
                `  File: ${outputPath}\n` +
                `  Size: ${sizeKB}KB\n` +
                `  Format: ${resultFormat}`,
            },
          ],
          details: {
            assetType: asset_type,
            capability,
            model,
            outputPath,
            sizeKB,
            format: resultFormat,
          },
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        throw new Error(`Media generation failed: ${message}`);
      }
    },
  });
}

// --- Helpers ---

function resolveProvider(
  providers: MediaProvider[],
  capability: Capability,
  preferredName?: string
): MediaProvider | undefined {
  if (preferredName) {
    const p = providers.find(
      (p) => p.name === preferredName && p.capabilities.includes(capability)
    );
    if (p) return p;
  }
  return providers.find((p) => p.capabilities.includes(capability));
}

function inferCapabilityFromModel(model: string): Capability {
  if (model.includes("Hailuo") || model.includes("T2V") || model.includes("I2V") || model.includes("S2V")) return "video";
  if (model.includes("speech")) return "speech";
  if (model.includes("music")) return "music";
  if (model.includes("image")) return "image";
  throw new Error(
    `Cannot infer capability from model "${model}". Specify a known model or use a non-custom asset_type.`
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function timestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Cancelled"));
      },
      { once: true }
    );
  });
}
