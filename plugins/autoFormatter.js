/**
 * plugins/autoFormatter.js
 *
 * Example plugin for Gemini-CLI / AI Dev Suite.
 * Automatically registers a command called "format" that prettifies code blocks.
 */

export const plugin = {
  name: "AutoFormatter",
  version: "1.0.0",
  description: "Formats JavaScript and TypeScript code snippets.",
  
  onLoad(app) {
    console.log(`[AutoFormatter] Plugin initialized.`);

    // Example command registration
    app.registerCommand("format", (code) => {
      if (typeof code !== "string") return "Invalid input.";
      try {
        const formatted = formatCode(code);
        return formatted;
      } catch (err) {
        return `Formatting failed: ${err.message}`;
      }
    });
  },
};

/**
 * Basic JS/TS formatting logic using built-in indentation.
 * Replace or extend this with Prettier or a custom formatter later.
 */
function formatCode(input) {
  let output = input
    .replace(/\t/g, "  ")
    .replace(/ +(?=\n)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Add newline at end if missing
  if (!output.endsWith("\n")) output += "\n";
  return output;
}
