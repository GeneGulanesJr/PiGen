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
import { slugify, sleep } from "../utils.js";
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

/**
 * Default suite assets — the kit generated when the user calls
 * /media suite without specifying `assets`.
 *
 * PRESENTATION-FOCUSED by default: produces a slide-deck-ready kit
 * (cover + overview illustration + step diagram + concept diagram) plus
 * voiceover and background music for an explainer. To get the marketing
 * kit (hero + social trio) instead, pass `assets` explicitly.
 */
const DEFAULT_SUITE_ASSETS: Array<{
  assetType: string;
  filename: string;
  aspectRatio?: string;
}> = [
  // Presentation / illustration — the slide-deck core (16:9 throughout)
  { assetType: "slide_cover", filename: "slide-01-cover", aspectRatio: "16:9" },
  { assetType: "slide_illustration", filename: "slide-02-overview", aspectRatio: "16:9" },
  { assetType: "step_diagram", filename: "slide-03-how-it-works", aspectRatio: "16:9" },
  { assetType: "concept_diagram", filename: "slide-04-deep-dive", aspectRatio: "16:9" },
  // Audio
  { assetType: "voiceover", filename: "voiceover" },
  { assetType: "background_music", filename: "background-music" },
];

/**
 * Per-asset-type prompt templates. When the user does NOT provide a
 * per-asset prompt, we compose one from the theme + this template. The
 * templates steer the LLM-generated composition toward slide-friendly
 * framing (negative space, focal subject, illustration-led, 16:9).
 *
 * HARDENED (round 2) — image models often default to photorealism, so
 * every image template is prefixed with STYLE_PREFIX (strong positive
 * illustration cues plus a list of well-known reference brands) and
 * suffixed with NEG_BLOCK (explicit "do not"s that push the model away
 * from photography / portraits / 3D). The original round-1 prompts only
 * had soft positive cues ("like a New Yorker cover") and the model
 * produced a photorealistic portrait — the NEG block is what fixes that.
 */
const STYLE_PREFIX =
  "2D editorial illustration, hand-drawn vector, flat color with subtle depth, " +
  "limited palette, clean linework, no camera depth of field, no lens blur. " +
  "Visual language references: Notion changelog, Stripe blog hero, Linear blog, " +
  "Vercel docs, GitHub Octocat, OpenAI hero, Anthropic announcement art. ";

const NEG_BLOCK =
  "STRICT NEGATIVE: no photograph, no photorealism, no 3D render, no CGI, " +
  "no human portrait, no human face, no headshot, no lens flare, no bokeh, " +
  "no cinematic lighting on a real person, no realistic skin, no realistic eyes. " +
  "Illustration only.";

const ASSET_PROMPT_TEMPLATES: Record<string, (theme: string) => string> = {
  slide_cover: (theme) =>
    `${STYLE_PREFIX}` +
    `Title-slide cover illustration for: ${theme}. ` +
    `Bold focal subject, dramatic but flat-with-depth lighting, cinematic composition. ` +
    `Generous negative space at the top (headline-safe) and at the bottom (subtitle-safe). ` +
    `16:9 framing. ${NEG_BLOCK}`,
  slide_illustration: (theme) =>
    `${STYLE_PREFIX}` +
    `Slide-ready editorial illustration for: ${theme}. ` +
    `One clear visual metaphor rendered as a friendly, modern 2D illustration. ` +
    `Generous headline-safe area at the top, caption-safe area at the bottom. ` +
    `16:9. No embedded text. ${NEG_BLOCK}`,
  step_diagram: (theme) =>
    `${STYLE_PREFIX}` +
    `Sequential step diagram explaining: ${theme}. ` +
    `Numbered flow (1 → 2 → 3 → 4) progressing left-to-right, each step is a clean ` +
    `flat iconographic illustration connected by arrows. Visual progression is the key. ` +
    `16:9. Suitable for an explainer slide. ${NEG_BLOCK}`,
  concept_diagram: (theme) =>
    `${STYLE_PREFIX}` +
    `Concept diagram illustrating: ${theme}. ` +
    `Abstract metaphor rendered as a 2D editorial illustration with one central idea ` +
    `and supporting visual elements around it. ` +
    `16:9. ${NEG_BLOCK}`,
  frame: (theme) =>
    `${STYLE_PREFIX}` +
    `Single storyboard frame for: ${theme}. ` +
    `A specific moment in the narrative rendered as a 2D illustrated frame — wide ` +
    `shot, consistent character design, clear silhouette, readable background. ` +
    `16:9. Match the framing language of html-video and hyperframes. ${NEG_BLOCK}`,
  // Marketing / docs
  architecture_diagram: (theme) =>
    `${STYLE_PREFIX}` +
    `Architecture diagram for: ${theme}. ` +
    `Isometric 2D illustration, dark theme background, labeled components, clean ` +
    `technical linework. 16:9. ${NEG_BLOCK}`,
  hero_image: (theme) =>
    `${STYLE_PREFIX}` +
    `Hero banner illustration for: ${theme}. ` +
    `Professional GitHub README style — bold 2D illustration, clear focal subject, ` +
    `modern flat color. 16:9. ${NEG_BLOCK}`,
  social_asset: (theme) =>
    `${STYLE_PREFIX}` +
    `Social media card illustration for: ${theme}. ` +
    `Bold layout, single focal element, eye-catching 2D composition. ${NEG_BLOCK}`,
  // Audio
  voiceover: (theme) =>
    `Narration: Introduce "${theme}" and walk the viewer through what it does, who it is for, and why it matters. Keep it conversational, around 60-90 seconds.`,
  background_music: () =>
    `Subtle, modern, instrumental background music suitable for a technical explainer video. Minimal percussion, warm synth pads, calm tempo.`,
  // Video
  video_explainer: (theme) =>
    `Animated explainer video for: ${theme}. Step-by-step walkthrough with [Zoom in] on key details and [Pan left] between sections. Modern motion graphics style.`,
  feature_showcase: (theme) =>
    `Feature showcase video for: ${theme}. Dynamic demonstration with [Tracking shot] reveals and [Push in] on key UI moments.`,
  screenshot_animation: (theme) =>
    `Smooth pan/zoom over a screenshot showing: ${theme}. Use [Push in] and [Pan] camera commands.`,
};

export function registerGenerateSuiteTool(
  pi: ExtensionAPI,
  providers: MediaProvider[]
) {
  pi.registerTool({
    name: "generate_media_suite",
    label: "Generate Media Suite",
    description:
      "Batch generate a full media kit for a repo feature. The default kit is " +
      "PRESENTATION-FOCUSED — slide_cover, slide_illustrations, step_diagram, " +
      "concept_diagram, voiceover, and background_music. Pass `assets` to " +
      "override (e.g. ['hero_image', 'social_asset', 'social_asset', 'social_asset'] " +
      "for the marketing kit). Use the prompts map to provide per-asset " +
      "generation prompts. Missing prompts fall back to per-asset-type templates.",
    promptSnippet:
      "Generate a full media suite for a repo feature — all assets at once",
    promptGuidelines: [
      "Use generate_media_suite when the user wants a complete media kit for a feature or module.",
      "Provide per-asset prompts in the prompts map. Each prompt should be crafted for its specific asset type.",
      "The prompt parameter is the overall theme. Individual prompts in the prompts map override it per asset.",
      "Default suite is PRESENTATION-FOCUSED: slide_cover + 2 slide_illustrations + step_diagram + concept_diagram + voiceover + background_music. Override the assets list to generate marketing material (hero_image + social_asset trio) or custom combos.",
      "For presentation image types, prompts should describe SLIDE-READY compositions with clear focal subject, negative space for text overlay, and illustration-led framing (16:9).",
      "For slide_cover: bold focal subject, dramatic lighting, headline-friendly composition.",
      "For slide_illustration: editorial illustration with one clear metaphor, friendly style, room for a headline at the top and a caption at the bottom.",
      "For step_diagram: numbered or sequenced flow with visual progression, clean iconography.",
      "For concept_diagram: explanatory concept art, abstract metaphor in editorial style.",
      "For frame: ONE moment of a storyboard or video sequence, with camera angle and action.",
      "For voiceover: the prompt IS the narration text, not a description of desired narration.",
      "For background_music: describe style, mood, instrumentation.",
      "For social_asset: one prompt generates all 3 aspect ratio variants (1:1, 16:9, 9:16).",
      "For hero_image: professional GitHub README hero banner, 16:9.",
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
        const aspectKey = a.aspectRatio?.replace(":", "x");
        const template = ASSET_PROMPT_TEMPLATES[a.assetType];
        const assetPrompt =
          prompts[a.assetType] ??
          prompts[`${a.assetType}_${aspectKey}`] ??
          (template ? template(theme) : `${theme} — ${a.assetType.replace(/_/g, " ")}`);

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
          ...suiteAssets.map((a) => {
            const aspect = a.aspectRatio ? ` (${a.aspectRatio})` : "";
            return `  ✅ ${a.filename}.${a.ext} — ${a.assetType}${aspect}`;
          }),
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
              // The slide/marketing image templates already include a
              // STRICT NEGATIVE block in the prompt itself. We pass
              // negativePrompt through to the provider for future
              // providers that support it natively.
              const r = await provider.image!.generate({
                prompt: asset.prompt,
                model,
                aspectRatio: asset.aspectRatio,
                negativePrompt:
                  "photograph, photorealism, 3D render, CGI, human portrait, human face, headshot, lens flare, bokeh, realistic skin, realistic eyes",
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
