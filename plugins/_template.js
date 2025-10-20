// plugins/_template.js
// Starter template for Gemini Playground plugins
// Copy this file, rename it (e.g. "myPlugin.js"), and restart or let the Plugin Manager auto-detect it.

export const name = "myPlugin";        // must be unique
export const version = "1.0.0";        // optional, but shown in UI

/**
 * Called when the plugin is first activated.
 * @param {object} ctx - Shared sandboxed context:
 *   {
 *     log(...args) - safe console logger,
 *     ai: { requestAIInjection(...) },
 *     assets,       // asset helpers from core
 *     version,       // app version
 *     events,        // shared EventEmitter for cross-plugin messages
 *     emit(event, ...args)
 *     on(event, handler)
 *   }
 */
export async function activate(ctx) {
  ctx.log(`[${name}] activated`);
  
  // Example: listen to a shared event
  ctx.on("asset:added", (asset) => {
    ctx.log(`[${name}] new asset detected`, asset);
  });

  // Example: emit your own event
  ctx.emit("plugin:status", { name, status: "ready" });

  // Example: schedule a task or hook into AI
  // const result = await ctx.ai.requestAIInjection("Summarize latest code diff");
  // ctx.log("AI said:", result);
}

/**
 * Called when the plugin is deactivated or the app shuts down.
 * Clean up timers, listeners, or file handles here.
 */
export async function deactivate() {
  console.log(`[${name}] deactivated`);
}

/**
 * Optional: You can export helper functions too.
 * These can be called via ctx.events.emit("call", { plugin: name, fn: "doSomething", args })
 */
export function doSomethingCool(input) {
  return `Cool result from ${name}: ${input}`;
}

// Metadata (optional but useful for the manager cache)
export const meta = {
  description: "Describe what your plugin does here.",
  author: "you",
  repository: "",
};
