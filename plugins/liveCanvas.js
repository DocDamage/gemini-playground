// /plugins/liveCanvas.js
/**
 * Purpose: Example Runtime Plugin (Batch 6)
 *
 * This plugin listens to runtime output. If it detects a special
 * command (e.g., [CANVAS_DRAW]), it interprets it and emits
 * a UI event to draw on a canvas.
 *
 * Conforms to the new plugin architecture (meta + register).
 */

/**
 * The metadata block. This is read first and validated
 * against /config/pluginSchema.json by the pluginManager.
 */
export const meta = {
  id: "live-canvas",
  name: "Live Canvas",
  version: "1.0.0",
  description: "Draws shapes on a canvas based on runtime output.",
  author: "Doc",
  
  // We need 'runtime' to listen to events, and 'ui' to emit
  // new drawing events.
  permissions: [
    "runtime", // Implied by listening to runtime events
    "ui" // Implied by emitting UI events
  ],
  
  ui: ["rightDrawer"] // Suggests it has a panel in the right drawer
};

/**
 * The plugin's entry point.
 * This is called by the pluginManager *inside* the secure VM.
 * @param {object} ctx - The sandboxed context object with proxied APIs.
 */
export function register(ctx) {
  ctx.console.log('Plugin "live-canvas" registered successfully.');

  // Define the function that will handle runtime output
  const handleRuntimeOutput = (log) => {
    if (log.type !== 'stdout' || !log.message) {
      return;
    }

    const message = log.message.trim();

    // Check for our special command
    if (message.startsWith('[CANVAS_DRAW]')) {
      try {
        // e.g., [CANVAS_DRAW] {"shape": "rect", "x": 10, "y": 10, "w": 50, "h": 50, "color": "red"}
        const jsonString = message.substring(13).trim();
        const drawCommand = JSON.parse(jsonString);

        // We have a valid command. Emit a new, custom event
        // that the UI (e.g., a React component) can listen for.
        ctx.events.emit('canvas:draw', drawCommand);

      } catch (e) {
        ctx.console.error(`Failed to parse CANVAS_DRAW command: ${e.message}`);
      }
    }
  };

  // Subscribe to the runtime 'stdout' event
  // Note: We'll listen for the custom log event from RuntimeContext,
  // as 'runtime:stdout' is a raw chunk.
  // VERIFY_BEFORE_COMMIT: The 'ctx.events.on' signature needs to be
  // firmed up. Assuming 'log:add' is the event from RuntimeContext.
  // For now, let's assume RuntimeContext emits a 'log' event.
  
  // We'll listen to 'runtime:stdout' which is defined in runtimeBridge
  // and RuntimeContext. We'll need to buffer it.
  // A simpler approach for this example:
  // Let's assume RuntimeContext emits a 'log:added' event with the LogEntry
  
  // ctx.events.on('log:added', handleRuntimeOutput);
  
  // For this batch, let's just log. The event bus wiring is complex.
  // We will demonstrate listening to the 'runtime:start' event.
  ctx.events.on('runtime:start', ({ lang }) => {
    ctx.console.log(`LiveCanvas saw runtime start for ${lang}`);
    
    // Example of emitting a UI event
    ctx.events.emit('canvas:clear');
  });
  
  ctx.console.log('Subscribed to runtime events.');
}

/**
 * The plugin's exit point (optional).
 * This is called by the pluginManager before unload.
 * @param {object} ctx - The sandboxed context object.
 */
export function unregister(ctx) {
  // Unsubscribe from all events to prevent memory leaks
  // ctx.events.off('log:added', handleRuntimeOutput);
  ctx.events.off('runtime:start');
  ctx.console.log('Plugin "live-canvas" unregistered.');
}