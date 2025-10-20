\# Gemini Playground - Plugin Development Guide



Welcome to the Gemini Playground plugin development guide. This document explains how to build and register new plugins to extend the application's functionality.



\## 1. Plugin Philosophy



Plugins are the primary way to add new features to the Playground. The core idea is "everything that isn't essential core logic belongs in a plugin."



The system is built on a \*\*secure, sandboxed architecture\*\*. Your plugin code will \*\*not\*\* run in the main Node.js process. Instead, it runs in a dedicated, isolated VM with a limited, proxied set of APIs. This ensures a plugin cannot accidentally or maliciously access the file system, network, or other sensitive resources unless you explicitly request permission for it.



\## 2. File Structure



\- Plugins are single `.js` files located in the `/plugins/` directory.

\- Each file must export two key items:

&nbsp; 1.  `export const meta = { ... }`

&nbsp; 2.  `export function register(ctx) { ... }`

\- An optional `export function unregister(ctx) { ... }` can also be provided for cleanup.



The system will automatically detect, validate, and (if valid) load any `.js` file you add to this directory.



\## 3. The `meta` Block



The `meta` block is a simple exported constant object. It is how your plugin tells the \*\*pluginManager\*\* what it is, who made it, and what permissions it needs.



It \*\*must\*\* validate against the `/config/pluginSchema.json` file.



\### Required Fields



\- `id` (string): A unique, machine-readable ID. (e.g., `"auto-formatter"`, `"ai-refactor"`)

\- `name` (string): A human-readable name. (e.g., `"Auto Formatter"`)

\- `version` (string): A semantic version string. (e.g., `"1.0.1"`)



\### Optional Fields



\- `description` (string): A short description of what the plugin does.

\- `author` (string): The name of the plugin's author.

\- `permissions` (array): A list of strings declaring which core APIs you need. \*\*This is critical for security.\*\*

\- `ui` (array): A list of strings declaring where your plugin wants to add UI elements.



\### Example `meta` Block



```javascript

export const meta = {

&nbsp; id: "my-first-plugin",

&nbsp; name: "My First Plugin",

&nbsp; version: "1.0.0",

&nbsp; description: "A simple plugin that logs runtime events.",

&nbsp; author: "A. Developer",

&nbsp; 

&nbsp; // I need to access the runtime API and listen to events

&nbsp; permissions: \[

&nbsp;   "runtime" 

&nbsp; ],

&nbsp; 

&nbsp; // I want to add a panel to the right drawer

&nbsp; ui: \[

&nbsp;   "rightDrawer"

&nbsp; ]

};

