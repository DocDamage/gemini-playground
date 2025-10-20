/**
 * core/codeIndex.js
 *
 * Static code indexer for Gemini Playground.
 * Scans project files (respecting .gitignore) to build a map
 * of imports, exports, functions, and classes using AST parsing.
 *
 * FEATURE 5 (Project Context) - Phase 2:
 * - Added 'getFileIndexData' function to retrieve index data for a specific file.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import ignore from 'ignore'; // For .gitignore
import parser from '@babel/parser'; // AST Parser
import traverse from '@babel/traverse'; // AST Traversal

// Default extensions to scan
const DEFAULT_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"];

// --- Utility helpers ---

/**
 * Reads files recursively from a directory, respecting .gitignore rules.
 */
function readFilesRecursively(dir, ig, extensions) {
  let files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // Use project-relative path for ignore check, assuming projectPath is cwd for ignore
      const relativePath = path.relative(ig._rules[0]?.origin?.path || process.cwd(), fullPath);

      // Skip if ignored (handle node_modules specifically)
      if (entry.name === 'node_modules' || ig.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...readFilesRecursively(fullPath, ig, extensions));
      } else if (extensions.includes(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  } catch (err) {
     console.warn(`[CodeIndex] Failed to read directory ${dir}:`, err.message);
  }
  return files;
}

function hashFileContent(content) {
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Parses file content using AST to extract metadata.
 */
function parseFileMetadataAST(filePath, content) {
  const imports = [];
  const exports = [];
  const functions = [];
  const classes = [];

  try {
    const ast = parser.parse(content, {
      sourceType: "module", // Assume ES modules
      plugins: [
        "jsx", // Enable JSX
        "typescript", // Enable TypeScript
        "decorators-legacy", // Allow legacy decorators
        "classProperties", // Needed for modern class features
        "optionalChaining",
        "nullishCoalescingOperator"
      ],
      errorRecovery: true, // Try to parse even with errors
    });

    traverse.default(ast, {
      ImportDeclaration(path) {
        imports.push({
          source: path.node.source.value,
          specifiers: path.node.specifiers.map(spec => {
             if (spec.type === 'ImportDefaultSpecifier') return { type: 'default', local: spec.local.name };
             if (spec.type === 'ImportSpecifier') return { type: 'named', local: spec.local.name, imported: spec.imported.name };
             if (spec.type === 'ImportNamespaceSpecifier') return { type: 'namespace', local: spec.local.name };
             return null;
          }).filter(Boolean),
        });
      },
      ExportNamedDeclaration(path) {
         if (path.node.declaration) {
             const dec = path.node.declaration;
             let name = dec.id?.name;
             if (dec.type === 'FunctionDeclaration' || dec.type === 'ClassDeclaration') {
                if (name) exports.push({ type: 'named', name });
             } else if (dec.type === 'VariableDeclaration') {
                 // Handle export const/let/var foo = ... (potentially multiple)
                 dec.declarations.forEach(decl => {
                     if (decl.id.type === 'Identifier') {
                         exports.push({ type: 'named', name: decl.id.name });
                     }
                     // Could add support for export const { x, y } = ... later if needed
                 });
             }
         } else if (path.node.specifiers.length > 0) {
             // E.g., export { foo, bar } or export { foo as default }
             path.node.specifiers.forEach(spec => {
                 // Use spec.exported.name for the exported name
                 exports.push({ type: 'named', name: spec.exported.name, local: spec.local.name });
             });
         }
         // Handle export { foo } from './bar';
         if (path.node.source) {
              path.node.specifiers.forEach(spec => {
                 exports.push({ type: 're-export-named', name: spec.exported.name, local: spec.local.name, source: path.node.source.value });
             });
         }
      },
      ExportDefaultDeclaration(path) {
        let name = '[default]'; // Default anonymous name
        if (path.node.declaration) {
            if (path.node.declaration.id && path.node.declaration.id.name) {
                // export default function foo() {} or class Foo {}
                name = path.node.declaration.id.name;
            } else if (path.node.declaration.type === 'Identifier') {
                // export default foo;
                name = path.node.declaration.name;
            }
        }
        exports.push({ type: 'default', name });
      },
       ExportAllDeclaration(path) {
        // export * from './bar';
        exports.push({ type: 're-export-all', source: path.node.source.value });
      },
      FunctionDeclaration(path) {
        if (path.node.id) functions.push(path.node.id.name);
      },
      FunctionExpression(path) {
        // Capture assigned functions: const myFunc = function() {}
        if (path.parent.type === 'VariableDeclarator' && path.parent.id.type === 'Identifier') {
           functions.push(path.parent.id.name);
        }
         // Could also capture class methods if needed
      },
       ArrowFunctionExpression(path) {
        // Capture assigned arrow functions: const myFunc = () => {}
        if (path.parent.type === 'VariableDeclarator' && path.parent.id.type === 'Identifier') {
           functions.push(path.parent.id.name);
        }
      },
      ClassDeclaration(path) {
        if (path.node.id) classes.push(path.node.id.name);
      },
    });

  } catch (err) {
    console.warn(`[CodeIndex] AST Parse Error in ${path.basename(filePath)}: ${err.message}. Metadata may be incomplete.`);
    return { imports: [], exports: [], functions: [], classes: [] };
  }

  // Deduplicate entries
  return {
     imports, // Imports usually don't need deduplication unless structure is complex
     exports, // Exports might need deduplication based on 'name' if multiple exports exist
     functions: [...new Set(functions)],
     classes: [...new Set(classes)],
   };
}


// --- Indexing core logic ---

/**
 * Scans a project directory and builds an index of its code structure.
 */
export async function indexProject(projectPath = process.cwd()) {
  const index = {};
  const gitignorePath = path.join(projectPath, '.gitignore');
  const cachePath = path.join(projectPath, ".code_index.json");

  // Initialize ignore rules, anchored to projectPath
  const ig = ignore();
  if (fs.existsSync(gitignorePath)) {
    // Pass projectPath as the origin directory for ignore rules
    ig.add(fs.readFileSync(gitignorePath, 'utf8'));
    // Manually add origin to rules if needed, library might handle this
  }
  ig.add('node_modules/*');
  ig.add('.*');
  ig.add('.*/');

  // Get list of files respecting .gitignore, using projectPath as base
  const files = readFilesRecursively(projectPath, ig, DEFAULT_EXTENSIONS);

  console.log(`[CodeIndex] Found ${files.length} files to index in ${projectPath}`);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf8");
      const hash = hashFileContent(content);
      const meta = parseFileMetadataAST(file, content);
      const relativeFilePath = path.relative(projectPath, file);
      index[relativeFilePath] = { hash, ...meta };
    } catch (err) {
      console.warn(`[CodeIndex] Failed to index ${file}:`, err.message);
    }
  }

  try {
     fs.writeFileSync(cachePath, JSON.stringify(index, null, 2));
     console.log(`[CodeIndex] Index cache saved to ${cachePath}`);
  } catch (err) {
     console.error(`[CodeIndex] Failed to write index cache:`, err);
  }

  return index;
}

/**
 * Loads the index from the cache file within the project directory.
 */
export async function getCachedIndex(projectPath = process.cwd()) {
  const cachePath = path.join(projectPath, ".code_index.json");
  if (!fs.existsSync(cachePath)) {
     console.warn(`[CodeIndex] Cache file not found at ${cachePath}. Run indexProject first?`);
     return {}; // Return empty object if no cache
  }
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch (err) {
    console.error(`[CodeIndex] Failed to load or parse index cache ${cachePath}:`, err);
    return {}; // Return empty on error
  }
}

/**
 * [NEW] Feature 5, Phase 2: Retrieves index data for a specific file.
 * @param {string} projectPath - The root path of the project.
 * @param {string} relativeFilePath - The project-relative path to the file.
 * @returns {Promise<object|null>} The index data for the file, or null if not found.
 */
export async function getFileIndexData(projectPath = process.cwd(), relativeFilePath) {
  if (!relativeFilePath) return null;
  const index = await getCachedIndex(projectPath);
  return index[relativeFilePath] || null;
}


/**
 * Returns a focused context window of a given file.
 */
export async function getFileContext(filePath, radius = 10) {
  // Ensure filePath is absolute for reading
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return "";
  try {
      const lines = fs.readFileSync(absolutePath, "utf8").split("\n");
      const mid = Math.floor(lines.length / 2);
      const start = Math.max(0, mid - radius);
      const end = Math.min(lines.length, mid + radius);
      return lines.slice(start, end).join("\n");
  } catch (err) {
      console.warn(`[CodeIndex] Failed to read context for ${filePath}:`, err);
      return "";
  }
}

/**
 * Gets a list of identified classes/components from the index.
 */
export function getComponentList(index) {
  const components = [];
  if (!index) return components; // Handle null or undefined index

  Object.entries(index).forEach(([file, data]) => {
    if (!data) return; // Skip if file data is missing
    if (data.classes?.length) {
      components.push(...data.classes.map((c) => ({ name: c, file })));
    }
    if (data.functions?.length) {
       data.functions.forEach(f => {
           if (f && f.match(/^[A-Z]/)) { // Added check for 'f' being truthy
               components.push({ name: f, file });
           }
       });
    }
  });
  const uniqueMap = new Map();
  components.forEach(c => uniqueMap.set(`${c.file}#${c.name}`, c));
  return Array.from(uniqueMap.values());
}

// Keep the default export structure
export default {
  indexProject,
  getCachedIndex,
  getFileIndexData, // Added new function
  getFileContext,
  getComponentList,
};