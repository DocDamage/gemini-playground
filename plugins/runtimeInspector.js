// /plugins/runtimeInspector.js
/**
 * Purpose: Example Debug Plugin (Batch 6)
 *
 * This plugin inspects the runtime system. It lists the available
 * runtimes on start and logs a summary of every execution.
 *
 * Conforms to the new plugin architecture (meta + register).
 */

/**
 * The metadata block. This is read first and validated
 * against /config/pluginSchema.json by the pluginManager.
 */
export const meta = {
  id: "runtime-inspector",
  name: "Runtime Inspector",
  version: "1.0.0",
  description: "A debug tool that logs runtime execution events.",
  author: "Doc",
  
  // This plugin requires permission to access the runtime API
  // and listen to its events.
  permissions: [
    "runtime"
  ],
  
  ui: ["rightDrawer"] // Suggests it has a panel in the right drawer
};

// Store the event handler function so we can remove it later
let handleRuntimeDone = null;

/**
 * The plugin's entry point.
 * @param {object} ctx - The sandboxed context object with proxied APIs.
 */
export function register(ctx) {
  ctx.console.log('Plugin "runtime-inspector" registered.');

  // 1. Access the proxied runtime API
  try {
    const runtimes = ctx.runtime.listRuntimes();
    ctx.console.log(`Found ${runtimes.length} available runtimes:`);
    runtimes.forEach(rt => {
      ctx.console.log(`- ${rt.label} (id: ${rt.id})`);
    });
  } catch (e) {
    ctx.console.error(`Could not list runtimes: ${e.message}`);
  }

  // 2. Define an event handler
  handleRuntimeDone = (result) => {
    if (!result) return;
    
    const { lang, duration, success, error } = result;
    if (success) {
      ctx.console.log(`[INSPECT] Run success: lang=${lang}, duration=${duration}ms`);
    } else {
      ctx.console.warn(`[INSPECT] Run failed: lang=${lang}, duration=${duration}ms, error=${error}`);
    }
  };

  // 3. Subscribe to runtime events
  // 'runtime:done' is an event emitted by RuntimeContext (Batch 3)
  // and proxied by the pluginManager.
  ctx.events.on('runtime:done', handleRuntimeDone);
  ctx.console.log('Subscribed to "runtime:done" event.');
}

/**
 * The plugin's exit point (optional).
 * @param {object} ctx - The sandboxed context object.
 */
export function unregister(ctx) {
  // Unsubscribe from the event to prevent memory leaks
  if (handleRuntimeDone) {
    ctx.events.off('runtime:done', handleRuntimeDone);
  }
  ctx.console.log('Plugin "runtime-inspector" unregistered.');
}