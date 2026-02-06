const fs = require('fs');
const path = require('path');
const NtExecutable = require('resedit').NtExecutable;
const NtExecutableResource = require('resedit').NtExecutableResource;
const Resource = require('resedit').Resource;

/**
 * Set icon and metadata for Windows executable
 * @param {string} exePath - Path to the executable
 * @param {string} iconPath - Path to the .ico file
 * @param {string} appName - Application name
 * @param {Object} options - Additional metadata options
 * @returns {Promise<void>}
 */
async function setIcon(exePath, iconPath, appName, options = {}) {
  try {
    // Read the executable
    const exeBuffer = fs.readFileSync(exePath);
    const exe = NtExecutable.from(exeBuffer);
    const res = NtExecutableResource.from(exe);

    // Read the icon file
    if (iconPath && fs.existsSync(iconPath)) {
      const iconBuffer = fs.readFileSync(iconPath);
      
      // Parse icon data
      const iconFile = Resource.IconFile.from(iconBuffer);
      
      // Replace icon in executable
      Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        1, // Icon group ID
        1033, // Language (English - United States)
        iconFile.icons.map((icon) => icon.data)
      );
      
      console.log(`   Applied icon: ${path.basename(iconPath)}`);
    }

    // Set version info
    const viList = Resource.VersionInfo.fromEntries(res.entries);
    const vi = viList[0] || Resource.VersionInfo.createEmpty();

    const {
      version = '1.0.0.0',
      companyName = '',
      fileDescription = appName,
      copyright = `Copyright © ${new Date().getFullYear()}`,
      productName = appName,
      internalName = appName.replace(/\s+/g, ''),
    } = options;

    // Parse version string
    const [major = 1, minor = 0, patch = 0, build = 0] = version.split('.').map(Number);

    // Set version numbers
    vi.setFileVersion(major, minor, patch, build, 1033);
    vi.setProductVersion(major, minor, patch, build, 1033);

    // Set string values
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        ProductName: productName,
        FileDescription: fileDescription,
        CompanyName: companyName,
        LegalCopyright: copyright,
        FileVersion: version,
        ProductVersion: version,
        InternalName: internalName,
        OriginalFilename: path.basename(exePath)
      }
    );

    vi.outputToResourceEntries(res.entries);

    // Write back to executable
    res.outputResource(exe);
    const newBuffer = exe.generate();
    fs.writeFileSync(exePath, Buffer.from(newBuffer));

    console.log(`   Applied metadata: ${appName} v${version}`);
  } catch (error) {
    console.warn(`   ⚠ Warning: Could not set icon/metadata: ${error.message}`);
    console.warn('   The executable was created but icon/metadata may be missing.');
  }
}

/**
 * Validate icon file
 * @param {string} iconPath - Path to icon file
 * @returns {boolean}
 */
function validateIcon(iconPath) {
  if (!fs.existsSync(iconPath)) {
    throw new Error(`Icon file not found: ${iconPath}`);
  }

  if (!iconPath.toLowerCase().endsWith('.ico')) {
    throw new Error('Icon file must be in .ico format');
  }

  const stats = fs.statSync(iconPath);
  if (stats.size === 0) {
    throw new Error('Icon file is empty');
  }

  if (stats.size > 1024 * 1024) {
    console.warn('Warning: Icon file is larger than 1MB, consider optimizing it');
  }

  return true;
}

/**
 * Extract icon from executable
 * @param {string} exePath - Path to executable
 * @param {string} outputPath - Output path for icon file
 * @returns {Promise<void>}
 */
async function extractIcon(exePath, outputPath) {
  try {
    const exeBuffer = fs.readFileSync(exePath);
    const exe = NtExecutable.from(exeBuffer);
    const res = NtExecutableResource.from(exe);

    // Find icon group
    const iconGroups = Resource.IconGroupEntry.fromEntries(res.entries);
    
    if (iconGroups.length === 0) {
      throw new Error('No icon found in executable');
    }

    // Get first icon group
    const iconGroup = iconGroups[0];
    const iconFile = Resource.IconFile.from(iconGroup, res.entries);

    // Write icon file
    fs.writeFileSync(outputPath, Buffer.from(iconFile.data));
    console.log(`Extracted icon to: ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to extract icon: ${error.message}`);
  }
}

module.exports = {
  setIcon,
  validateIcon,
  extractIcon
};
