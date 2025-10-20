// /core/archive.js
/**
 * Purpose: Manages project archiving (zipping) and restoration (unzipping).
 * Handles creating backups and extracting them.
 * Conforms to Batch 1 of MASTER_BUILD_GUIDE.md.
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import extract from 'extract-zip';

// Use process.cwd() to get project root, ensuring portability
const ARCHIVE_DIR = path.resolve(process.cwd(), 'cache', 'archives');

/**
 * Ensures the archive directory exists.
 * Creates it if it doesn't.
 */
async function ensureArchiveDir() {
  try {
    await fs.promises.access(ARCHIVE_DIR);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.promises.mkdir(ARCHIVE_DIR, { recursive: true });
    } else {
      console.error('Error accessing archive directory:', error);
      throw error;
    }
  }
}

/**
 * Creates a zip archive of a given project directory.
 * @param {string} projectPath - The absolute path to the project directory to archive.
 * @returns {Promise<string>} A promise that resolves with the full path to the created archive.
 */
export async function createArchive(projectPath) {
  await ensureArchiveDir();
  
  const projectName = path.basename(projectPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `${projectName}-${timestamp}.zip`;
  const archivePath = path.join(ARCHIVE_DIR, archiveName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Set compression level
    });

    output.on('close', () => {
      console.log(`Archive created: ${archiveName} (${archive.pointer()} total bytes)`);
      resolve(archivePath);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archive warning:', err);
      } else {
        reject(err);
      }
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    
    // Add the directory itself to the zip
    archive.directory(projectPath, path.basename(projectPath));
    
    archive.finalize();
  });
}

/**
 * Extracts a zip archive to a specified target directory.
 * @param {string} zipName - The name of the zip file in the /cache/archives/ directory.
 * @param {string} targetPath - The absolute path to extract the contents to.
 */
export async function extractArchive(zipName, targetPath) {
  // VERIFY_BEFORE_COMMIT: Spec 4.2.7 lists extractArchive(zipPath).
  // 'zipName' and 'targetPath' are inferred as necessary for a "restore" operation.
  // 'zipName' is assumed to be the *name* of the file, not the full path.
  
  await ensureArchiveDir();
  const zipPath = path.join(ARCHIVE_DIR, zipName);

  try {
    await fs.promises.access(zipPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Archive file not found: ${zipName}`);
    }
    throw error;
  }

  try {
    await extract(zipPath, { dir: targetPath });
    console.log(`Successfully extracted ${zipName} to ${targetPath}`);
  } catch (err) {
    console.error(`Error extracting archive ${zipName}:`, err);
    throw new Error('Archive extraction failed.');
  }
}

/**
 * Lists all available archives in the archive directory.
 * @returns {Promise<string[]>} A promise that resolves with an array of archive file names.
 */
export async function listArchives() {
  await ensureArchiveDir();
  
  try {
    const files = await fs.promises.readdir(ARCHIVE_DIR);
    return files.filter(file => file.endsWith('.zip'));
  } catch (err) {
    console.error('Failed to list archives:', err);
    return [];
  }
}