/**
 * Repo Media Generator — Pi Extension
 *
 * Generates repo-aware media assets (videos, images, voiceovers, music)
 * using AI generation APIs. MiniMax is the first provider.
 *
 * API Key: Uses the same MINIMAX_API_KEY env var that Pi's built-in
 * MiniMax provider uses. If MiniMax works for text in Pi, this extension
 * picks up the same key automatically.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerGenerateMediaTool } from "./tools/generate.js";
import { registerGenerateSuiteTool } from "./tools/generate_suite.js";
import { registerMediaCommand } from "./wizard.js";
import { loadProviders, setApiKey } from "./providers/minimax.js";

export default function (pi: ExtensionAPI) {
  // Try to resolve MiniMax API key from Pi's model registry first,
  // then fall back to MINIMAX_API_KEY env var
  pi.on("session_start", async (_event, ctx) => {
    try {
      // Pi's built-in minimax provider exposes models via the registry
      const models = ctx.modelRegistry?.list?.() ?? [];
      const minimaxModel = models.find((m: any) =>
        m.provider === "minimax" || m.providerId === "minimax"
      );

      if (minimaxModel) {
        // Pi has MiniMax configured — the env var is available
        // The provider reads MINIMAX_API_KEY at call time, no need to extract
      }
    } catch {
      // modelRegistry access may vary — env var fallback is sufficient
    }
  });

  // Load providers (reads MINIMAX_API_KEY env var internally)
  const providers = loadProviders();

  if (providers.length === 0) {
    pi.on("session_start", async (_event, ctx) => {
      ctx.ui.notify(
        "repo-media: No MiniMax API key found. Run /login in Pi to authenticate, or set MINIMAX_API_KEY.",
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
    if (providers.length === 0) {
      ctx.ui.notify(
        "repo-media: No media providers. Check MiniMax API key in ~/.pi/agent/auth.json",
        "error"
      );
    } else {
      const names = providers.map((p) => p.name).join(", ");
      ctx.ui.notify(`repo-media loaded — providers: ${names}`, "info");
    }
  });
}
