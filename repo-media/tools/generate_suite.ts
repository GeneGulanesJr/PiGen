/**
 * generate_media_suite tool — Batch generate a full media kit for a repo feature.
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
import { getDefaultModel } from "../wizard.js";

const ASSET_TYPE_ENUM = [
  ...VALID_ASSET_TYPES,
] as unknown as readonly string[];

interface SuiteAsset {
  assetType: string;
  capability: Capability;
  prompt: string;
  filename: string;
  ext: string;
  aspectRatio?: string;
}

const DEFAULT_SUITE_ASSETS: Array<{
  assetType: string;
  filename: string;
  aspectRatio?: string;
}> = [
  { assetType: "architecture_diagram", filename: "architecture-diagram" },
  { assetType: "hero_image", filename: "hero-image", aspectRatio: "16:9" },
  { assetType: "voiceover", filename: "voiceover" },
  { assetType: "background_music", filename: "background-music" },
  { assetType: "video_explainer", filename: "explainer" },
  { assetType: "social_asset", filename: "social-1x1", aspectRatio: "1:1" },
  { assetType: "social_asset", filename: "social-16x9", aspectRatio: "16:9" },
  { assetType: "social_asset", filename: "social-9x16", aspectRatio: "9:16" },
];

export function registerGenerateSuiteTool(
  pi: ExtensionAPI,
  providers: MediaProvider[]
) {
  pi.registerTool({
    name: "generate_media_suite",
    label: "Generate Media Suite",
    description:
      "Batch generate a full media kit for a repo feature — architecture diagram, hero image, " +
      "voiceover, background music, video explainer, and social assets. " +
      "Use the prompts map to provide per-asset generation prompts. " +
      "Missing prompts fall back to the theme + asset-type template.",
    promptSnippet:
      "Generate a full media suite for a repo feature — all assets at once",
    promptGuidelines: [
      "Use generate_media_suite when the user wants a complete media kit for a feature or module.",
      "Provide per-asset prompts in the prompts map. Each prompt should be crafted for its specific asset type.",
      "The prompt parameter is the overall theme. Individual prompts in the prompts map override it per asset.",
      "For voiceover: the prompt IS the narration text, not a description of desired narration.",
      "For background_music: describe style, mood, instrumentation.",
      "For social_asset: one prompt generates all 3 aspect ratio variants (1:1, 16:9, 9:16).",
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description: "Overall theme/topic description for the suite.",
      }),
      prompts: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description:
            'Per-asset prompts. Keys are asset types (e.g. "video_explainer", "voiceover"). ' +
            "Missing keys fall back to theme + asset-type template.",
        })
      ),
      target: Type.Optional(
        Type.String({
          description:
            "Feature, module, or 'whole repo'. Used for output subdirectory.",
        })
      ),
      assets: Type.Optional(
        Type.Array(StringEnum(ASSET_TYPE_ENUM), {
          description: "Which assets to generate. Default: all.",
        })
      ),
      style: Type.Optional(
        StringEnum(
          ["professional", "playful", "minimal", "cinematic"] as const,
          {
            description: "Style for all assets.",
          }
        )
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
            "Show plan review before generating. Default: true.",
        })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const theme = params.prompt;
      const prompts = params.prompts ?? {};
      const targetSlug = params.target ? slugify(params.target) : undefined;

      // Build asset list
      const requestedTypes = params.assets;
      const assetList = DEFAULT_SUITE_ASSETS.filter(
        (a) => !requestedTypes || requestedTypes.includes(a.assetType)
      );

      if (assetList.length === 0) {
        throw new Error("No assets to generate. Check the assets parameter.");
      }

      // Build suite assets with prompts
      const suiteAssets: SuiteAsset[] = assetList.map((a) => {
        const capability = ASSET_CAPABILITY_MAP[a.assetType] as Capability;
        const assetPrompt =
          prompts[a.assetType] ??
          prompts[`${a.assetType}_${a.aspectRatio?.replace(":", "x")}`] ??
          `${theme} — ${a.assetType.replace(/_/g, " ")}`;

        return {
          assetType: a.assetType,
          capability,
          prompt: assetPrompt,
          filename: a.filename,
          ext: ASSET_EXTENSIONS[a.assetType] ?? "mp4",
          aspectRatio: a.aspectRatio ?? DEFAULT_ASPECT_RATIOS[a.assetType],
        };
      });

      // Output directory
      const outputDir =
        params.output_dir ??
        (targetSlug ? `./repo-media/${targetSlug}/` : "./repo-media/");

      // Confirmation
      const shouldConfirm = params.confirm !== false;
      if (shouldConfirm && ctx.hasUI) {
        const lines = [
          `📦 Media Suite: "${theme}"`,
          "",
          "Will generate:",
          ...suiteAssets.map(
            (a) => `  ✅ ${a.filename}.${a.ext} (${a.assetType})`
          ),
          "",
          `Output: ${resolve(ctx.cwd, outputDir)}`,
        ];
        const ok = await ctx.ui.confirm("Generate Suite?", lines.join("\n"));
        if (!ok) {
          return {
            content: [{ type: "text", text: "Suite generation cancelled." }],
            details: { cancelled: true },
          };
        }
      }

      // Find providers
      const results: Array<{
        filename: string;
        path: string;
        success: boolean;
        error?: string;
        sizeKB?: number;
      }> = [];

      for (let i = 0; i < suiteAssets.length; i++) {
        const asset = suiteAssets[i];
        const progress = `[${i + 1}/${suiteAssets.length}]`;

        if (signal?.aborted) {
          results.push({
            filename: `${asset.filename}.${asset.ext}`,
            path: "",
            success: false,
            error: "Cancelled",
          });
          continue;
        }

        onUpdate?.({
          content: [
            {
              type: "text",
              text: `${progress} Generating ${asset.filename}...`,
            },
          ],
        });

        try {
          const provider = providers.find((p) =>
            p.capabilities.includes(asset.capability)
          );
          if (!provider) {
            throw new Error(`No provider for ${asset.capability}`);
          }

          const model = await getDefaultModel(asset.capability);
          const resolution =
            DEFAULT_RESOLUTIONS[asset.assetType] ?? "768p";

          let resultData: Buffer;
          let resultFormat: string;

          switch (asset.capability) {
            case "image": {
              const r = await provider.image!.generate({
                prompt: asset.prompt,
                model,
                aspectRatio: asset.aspectRatio,
              });
              resultData = r.data;
              resultFormat = r.format;
              break;
            }
            case "speech": {
              const r = await provider.speech!.generate({
                text: asset.prompt,
                model,
                voiceId: "English_expressive_narrator",
                format: "mp3",
              });
              resultData = r.data;
              resultFormat = r.format;
              break;
            }
            case "music": {
              const r = await provider.music!.generate({
                prompt: asset.prompt,
                model,
                isInstrumental: true,
                format: "mp3",
              });
              resultData = r.data;
              resultFormat = r.format;
              break;
            }
            case "video": {
              const videoProvider = provider.video!;
              const taskId = await videoProvider.submit({
                prompt: asset.prompt,
                model,
                mode: "text",
                duration: 6,
                resolution,
                promptOptimizer: true,
              });

              let status = await videoProvider.poll(taskId);
              while (status.status === "processing") {
                await sleep(10000, signal);
                status = await videoProvider.poll(taskId);
                onUpdate?.({
                  content: [
                    {
                      type: "text",
                      text: `${progress} ${asset.filename} processing...`,
                    },
                  ],
                });
              }

              if (status.status === "failed") {
                throw new Error(
                  status.error ?? "Video generation failed"
                );
              }

              resultData = await videoProvider.download(status.fileId!);
              resultFormat = "mp4";
              break;
            }
            default:
              throw new Error(
                `Unsupported capability: ${asset.capability}`
              );
          }

          // Save
          const outputPath = resolve(
            ctx.cwd,
            outputDir,
            `${asset.filename}.${resultFormat}`
          );
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, resultData);

          const sizeKB = Math.round(resultData.length / 1024);
          results.push({
            filename: `${asset.filename}.${resultFormat}`,
            path: outputPath,
            success: true,
            sizeKB,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : String(err);
          results.push({
            filename: `${asset.filename}.${asset.ext}`,
            path: "",
            success: false,
            error: message,
          });
        }
      }

      // Build summary
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      let summary = "";
      if (succeeded.length > 0) {
        summary += `✅ ${succeeded.length} asset(s) generated:\n`;
        summary += succeeded
          .map((r) => `  ${r.filename} (${r.sizeKB}KB) → ${r.path}`)
          .join("\n");
      }
      if (failed.length > 0) {
        summary += `\n❌ ${failed.length} asset(s) failed:\n`;
        summary += failed
          .map(
            (r) =>
              `  ${r.filename}: ${r.error}`
          )
          .join("\n");
      }
      summary += `\n📁 Output: ${resolve(ctx.cwd, outputDir)}`;

      return {
        content: [{ type: "text", text: summary }],
        details: {
          total: suiteAssets.length,
          succeeded: succeeded.length,
          failed: failed.length,
          results,
          outputDir: resolve(ctx.cwd, outputDir),
        },
      };
    },
  });
}

// --- Helpers (shared with generate.ts — could extract to utils.ts) ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
