/**
 * Interactive wizard for the /media command.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { MediaProvider } from "./providers/types.js";
import { VALID_ASSET_TYPES, DEFAULT_MODELS } from "./providers/types.js";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export function registerMediaCommand(
  pi: ExtensionAPI,
  providers: MediaProvider[]
) {
  pi.registerCommand("media", {
    description:
      "Generate media assets for this repo. Subcommands: suite, list, clean",
    getArgumentCompletions(prefix: string) {
      const subs = ["suite", "list", "clean"];
      const filtered = subs.filter((s) => s.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((s) => ({ value: s, label: s }))
        : null;
    },
    async handler(args, ctx) {
      const subcommand = args?.trim().split(/\s+/)[0] ?? "";

      switch (subcommand) {
        case "suite":
          await handleSuite(ctx);
          break;
        case "list":
          await handleList(ctx);
          break;
        case "clean":
          await handleClean(ctx);
          break;
        default:
          await handleWizard(ctx, providers);
          break;
      }
    },
  });
}

async function handleWizard(
  ctx: any,
  providers: MediaProvider[]
) {
  // Step 1: Asset type
  const assetType = await ctx.ui.select(
    "What do you want to create?",
    VALID_ASSET_TYPES.map((t) => t.replace(/_/g, " "))
  );
  if (!assetType) return;

  // Step 2: Target
  const targetChoice = await ctx.ui.select("What should it cover?", [
    "Whole repo",
    "Specific feature",
    "Recent changes",
  ]);
  let target: string | undefined;
  if (targetChoice === "Specific feature") {
    target = await ctx.ui.input("Feature/module name:", "my-feature");
  }

  // Step 3: Style
  const style = await ctx.ui.select("What style?", [
    "Professional",
    "Playful",
    "Minimal",
    "Cinematic",
  ]);

  // Step 4: Prompt
  const prompt = await ctx.ui.input(
    "Describe what to generate:",
    `${assetType} for ${target ?? "the repo"}`
  );
  if (!prompt) return;

  // Step 5: Confirm
  const ok = await ctx.ui.confirm(
    "Generate?",
    `Asset: ${assetType}\nStyle: ${style}\nTarget: ${target ?? "whole repo"}\nPrompt: ${prompt}`
  );
  if (!ok) return;

  // Send as user message to trigger tool call
  const command = `Generate a ${style?.toLowerCase() ?? "professional"} ${assetType} for ${target ?? "the repo"}: ${prompt}`;
  ctx.ui.notify(`Generating ${assetType}...`, "info");
  // The LLM will pick up the generate_media tool from context
}

async function handleSuite(ctx: any) {
  const theme = await ctx.ui.input("Suite theme:", "My project");
  if (!theme) return;

  const target = await ctx.ui.input("Target feature/module:", "whole repo");

  ctx.ui.notify("Starting media suite generation...", "info");
}

async function handleList(ctx: any) {
  const mediaDir = resolve(ctx.cwd, "repo-media");

  try {
    await stat(mediaDir);
  } catch {
    ctx.ui.notify("No ./repo-media/ directory found.", "info");
    return;
  }

  const entries = await listMediaFiles(mediaDir);

  if (entries.length === 0) {
    ctx.ui.notify("No generated media found in ./repo-media/", "info");
    return;
  }

  const lines = entries.map(
    (e) =>
      `  ${e.name.padEnd(35)} ${e.type.padEnd(8)} ${e.size.padEnd(10)} ${e.date}`
  );

  ctx.ui.notify(
    `./repo-media/ (${entries.length} files)\n${lines.join("\n")}`,
    "info"
  );
}

async function handleClean(ctx: any) {
  const mediaDir = resolve(ctx.cwd, "repo-media");

  try {
    await stat(mediaDir);
  } catch {
    ctx.ui.notify("No ./repo-media/ directory found.", "info");
    return;
  }

  const ok = await ctx.ui.confirm(
    "Delete all generated media?",
    `This will delete everything in ${mediaDir}`
  );
  if (!ok) return;

  const { rm } = await import("node:fs/promises");
  await rm(mediaDir, { recursive: true });
  ctx.ui.notify("Deleted ./repo-media/", "info");
}

async function listMediaFiles(
  dir: string,
  prefix = ""
): Promise<Array<{ name: string; type: string; size: string; date: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{
    name: string;
    type: string;
    size: string;
    date: string;
  }> = [];

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await listMediaFiles(fullPath, `${prefix}${entry.name}/`);
      files.push(...sub);
    } else if (entry.isFile()) {
      const s = await stat(fullPath);
      const ext = entry.name.split(".").pop() ?? "";
      const typeMap: Record<string, string> = {
        jpeg: "image",
        jpg: "image",
        png: "image",
        mp4: "video",
        mp3: "audio",
        wav: "audio",
        flac: "audio",
      };
      files.push({
        name: `${prefix}${entry.name}`,
        type: typeMap[ext] ?? ext,
        size: formatSize(s.size),
        date: s.mtime.toISOString().slice(0, 16).replace("T", " "),
      });
    }
  }

  return files;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
