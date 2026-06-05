/**
 * Repo Media Generator — Pi Extension
 *
 * Generates repo-aware media assets (videos, images, voiceovers, music)
 * using AI generation APIs. MiniMax is the first provider.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGenerateMediaTool } from "./tools/generate.js";
import { registerGenerateSuiteTool } from "./tools/generate_suite.js";
import { registerMediaCommand } from "./wizard.js";
import { loadProviders } from "./providers/minimax.js";

export default function (pi: ExtensionAPI) {
  // Load available providers
  const providers = loadProviders();

  if (providers.length === 0) {
    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.notify(
        "repo-media: No providers configured. Set MINIMAX_API_KEY env var.",
        "warning"
      );
    });
    return;
  }

  // Register tools
  registerGenerateMediaTool(pi, providers);
  registerGenerateSuiteTool(pi, providers);

  // Register /media command
  registerMediaCommand(pi, providers);

  pi.on("session_start", async (_event, ctx) => {
    const names = providers.map((p) => p.name).join(", ");
    ctx.ui.notify(`repo-media loaded — providers: ${names}`, "info");
  });
}
