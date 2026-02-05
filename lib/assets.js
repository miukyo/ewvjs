const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Bundle assets directory
 * @param {string} assetsDir - Source assets directory
 * @param {string} outputDir - Destination directory
 * @returns {Promise<void>}
 */
async function bundleAssets(assetsDir, outputDir) {
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Assets directory not found: ${assetsDir}`);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Copy assets directory
  await copyDirectory(assetsDir, outputDir);

  // Get stats
  const stats = getDirectoryStats(outputDir);
  console.log(`   Copied ${stats.files} files (${formatBytes(stats.size)})`);
}

/**
 * Copy directory recursively
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
async function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Create a zip archive of assets (alternative to direct copy)
 * @param {string} assetsDir - Source assets directory
 * @param {string} outputPath - Output zip file path
 * @returns {Promise<void>}
 */
async function createAssetsArchive(assetsDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    output.on('close', () => {
      console.log(`   Created archive: ${formatBytes(archive.pointer())}`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(assetsDir, false);
    archive.finalize();
  });
}

/**
 * Get directory statistics
 * @param {string} dirPath - Directory path
 * @returns {{files: number, size: number}}
 */
function getDirectoryStats(dirPath) {
  let fileCount = 0;
  let totalSize = 0;

  function traverse(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else {
        fileCount++;
        totalSize += fs.statSync(fullPath).size;
      }
    }
  }

  traverse(dirPath);
  return { files: fileCount, size: totalSize };
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
  bundleAssets,
  createAssetsArchive,
  copyDirectory,
  formatBytes
};
