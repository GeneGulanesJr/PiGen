/**
 * Interactive wizard for the /media command.
 * Includes /media models for setting default models per capability.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { MediaProvider, Capability } from "./providers/types.js";
import {
  VALID_ASSET_TYPES,
  DEFAULT_MODELS,
  ASSET_CAPABILITY_MAP,
} from "./providers/types.js";
import { readdir, stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { join } from "node:path";

// --- Persistent model defaults ---
// Stored in ~/.pi/agent/repo-media-models.json

const MODEL_CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "repo-media-models.json"
);

interface ModelDefaults {
  image?: string;
  speech?: string;
  music?: string;
  video?: string;
}

async function loadModelDefaults(): Promise<ModelDefaults> {
  try {
    const raw = await readFile(MODEL_CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveModelDefaults(defaults: ModelDefaults): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(MODEL_CONFIG_PATH), { recursive: true });
  await writeFile(MODEL_CONFIG_PATH, JSON.stringify(defaults, null, 2));
}

/** Get the default model for a capability (user preference > built-in default) */
export async function getDefaultModel(
  capability: Capability
): Promise<string> {
  const defaults = await loadModelDefaults();
  return defaults[capability] ?? DEFAULT_MODELS[capability] ?? "image-01";
}

/** Get all user-configured defaults */
export async function getModelDefaults(): Promise<ModelDefaults> {
  return loadModelDefaults();
}

// --- Command Registration ---

export function registerMediaCommand(
  pi: ExtensionAPI,
  providers: MediaProvider[]
) {
  pi.registerCommand("media", {
    description:
      "Generate media assets. Subcommands: models, suite, list, clean",
    getArgumentCompletions(prefix: string) {
      const subs = ["models", "suite", "list", "clean"];
      const filtered = subs.filter((s) => s.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((s) => ({ value: s, label: s }))
        : null;
    },
    async handler(args, ctx) {
      const parts = (args?.trim() ?? "").split(/\s+/);
      const subcommand = parts[0] ?? "";

      switch (subcommand) {
        case "models":
          await handleModels(ctx, providers, parts.slice(1));
          break;
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

// --- /media models ---

async function handleModels(
  ctx: any,
  providers: MediaProvider[],
  args: string[]
) {
  const capability = args[0] as Capability | undefined;
  const capabilities: Capability[] = ["image", "speech", "music", "video"];

  if (!capability || !capabilities.includes(capability)) {
    // Show current defaults + available models
    const defaults = await loadModelDefaults();
    const lines: string[] = ["🎬 Media Model Defaults\n"];

    for (const cap of capabilities) {
      const defaultModel =
        defaults[cap] ?? DEFAULT_MODELS[cap] ?? "unknown";
      const provider = providers.find((p) => p.capabilities.includes(cap));
      const models = getModelList(provider, cap);

      lines.push(`${cap.toUpperCase()}:`);
      lines.push(`  Default: ${defaultModel}`);
      lines.push(`  Available: ${models.join(", ")}`);
      lines.push("");
    }

    lines.push(
      "Set a default: /media models <image|speech|music|video> <model>"
    );
    lines.push("Example: /media models speech speech-2.8-turbo");

    ctx.ui.notify(lines.join("\n"), "info");
    return;
  }

  // Setting a default
  const requestedModel = args[1];
  const provider = providers.find((p) =>
    p.capabilities.includes(capability)
  );

  if (!provider) {
    ctx.ui.notify(`No provider available for ${capability}`, "error");
    return;
  }

  const available = getModelList(provider, capability);

  if (!requestedModel) {
    // Interactive: show picker
    const currentDefault = await getDefaultModel(capability);
    const choice = await ctx.ui.select(
      `Select default ${capability} model:`,
      available.map((m) => ({
        value: m,
        label: m === currentDefault ? `${m} (current)` : m,
      }))
    );
    if (!choice) return;
    requestedModel as string;
    await setDefaultModel(ctx, capability, choice as string);
  } else if (available.includes(requestedModel)) {
    await setDefaultModel(ctx, capability, requestedModel);
  } else {
    ctx.ui.notify(
      `Unknown model "${requestedModel}". Available: ${available.join(", ")}`,
      "error"
    );
  }
}

async function setDefaultModel(
  ctx: any,
  capability: Capability,
  model: string
) {
  const defaults = await loadModelDefaults();
  defaults[capability] = model;
  await saveModelDefaults(defaults);
  ctx.ui.notify(`✓ Default ${capability} model set to: ${model}`, "info");
}

function getModelList(
  provider: MediaProvider | undefined,
  capability: Capability
): string[] {
  if (!provider) return [];
  switch (capability) {
    case "image":
      return provider.image?.supportedModels() ?? [];
    case "speech":
      return provider.speech?.supportedModels() ?? [];
    case "music":
      return provider.music?.supportedModels() ?? [];
    case "video":
      return provider.video?.supportedModels() ?? [];
    default:
      return [];
  }
}

// --- /media (wizard) ---

async function handleWizard(ctx: any, providers: MediaProvider[]) {
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

  // Step 4: Model (optional — show current default, let user pick different)
  const capability = ASSET_CAPABILITY_MAP[assetType as string] as
    | Capability
    | undefined;
  if (capability) {
    const currentDefault = await getDefaultModel(capability);
    const provider = providers.find((p) =>
      p.capabilities.includes(capability)
    );
    const models = getModelList(provider, capability);

    if (models.length > 1) {
      const changeModel = await ctx.ui.confirm(
        `Model: ${currentDefault}`,
        `Use default (${currentDefault}) or pick a different model?`
      );
      if (!changeModel) {
        const choice = await ctx.ui.select(
          `Select ${capability} model:`,
          models.map((m) =>
            m === currentDefault ? `${m} (default)` : m
          )
        );
        if (choice) {
          ctx.ui.notify(
            `Using ${choice} for this generation. (Set permanent default with /media models ${capability} ${choice})`,
            "info"
          );
        }
      }
    }
  }

  // Step 5: Prompt
  const prompt = await ctx.ui.input(
    "Describe what to generate:",
    `${assetType} for ${target ?? "the repo"}`
  );
  if (!prompt) return;

  // Step 6: Confirm
  const ok = await ctx.ui.confirm(
    "Generate?",
    `Asset: ${assetType}\nStyle: ${style}\nTarget: ${target ?? "whole repo"}\nPrompt: ${prompt}`
  );
  if (!ok) return;

  ctx.ui.notify(`Generating ${assetType}...`, "info");
}

// --- /media suite ---

async function handleSuite(ctx: any) {
  const theme = await ctx.ui.input("Suite theme:", "My project");
  if (!theme) return;

  const target = await ctx.ui.input("Target feature/module:", "whole repo");

  ctx.ui.notify("Starting media suite generation...", "info");
}

// --- /media list ---

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

// --- /media clean ---

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

// --- Helpers ---

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
