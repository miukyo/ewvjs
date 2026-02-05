const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { bundleAssets } = require('./assets');
const { setIcon } = require('./icon');

/**
 * Convert console application to GUI application (hide console window)
 * @param {string} exePath - Path to the executable
 */
function convertToGuiApp(exePath) {
  try {
    // Read the executable as a buffer
    const exeBuffer = fs.readFileSync(exePath);
    
    // Get PE signature offset (at 0x3C in DOS header)
    const peOffset = exeBuffer.readUInt32LE(0x3C);
    
    // PE signature is 4 bytes ("PE\0\0")
    // COFF header is 20 bytes
    // Optional header starts at peOffset + 24
    // Subsystem is at offset 68 (0x44) in optional header
    const subsystemOffset = peOffset + 24 + 68;
    
    // Read current subsystem value
    const currentSubsystem = exeBuffer.readUInt16LE(subsystemOffset);
    console.log(`   Current subsystem: ${currentSubsystem} (3=CONSOLE, 2=GUI)`);
    
    // Set to IMAGE_SUBSYSTEM_WINDOWS_GUI (2) instead of CONSOLE (3)
    if (currentSubsystem === 3) {
      exeBuffer.writeUInt16LE(2, subsystemOffset);
      console.log(`   Changed subsystem to GUI (2)`);
      
      // Write the modified executable
      fs.writeFileSync(exePath, exeBuffer);
    }
  } catch (error) {
    console.warn(`   ⚠ Warning: Could not convert to GUI app: ${error.message}`);
    console.warn('   The executable will show a console window.');
  }
}

/**
 * Run pkg command using spawn
 * @param {string[]} args - Arguments for pkg
 * @returns {Promise<void>}
 */
function runPkg(args) {
  return new Promise((resolve, reject) => {
    // Try to find pkg binary in node_modules
    let pkgBin;
    try {
      const pkgPackageJson = require.resolve('@yao-pkg/pkg/package.json');
      const pkgDir = path.dirname(pkgPackageJson);
      
      // Check for different possible bin locations
      const possibleBins = [
        path.join(pkgDir, 'lib-es5', 'bin.js'),
        path.join(pkgDir, 'lib', 'bin.js'),
        path.join(pkgDir, 'bin', 'pkg.js')
      ];
      
      for (const bin of possibleBins) {
        if (fs.existsSync(bin)) {
          pkgBin = bin;
          break;
        }
      }
      
      if (!pkgBin) {
        throw new Error('pkg binary not found');
      }
    } catch (error) {
      reject(new Error(`Cannot find @yao-pkg/pkg installation: ${error.message}`));
      return;
    }
    
    console.log(`   Running: node ${pkgBin} ${args.join(' ')}`);
    
    // Spawn pkg process
    let stdout = '';
    let stderr = '';
    
    const pkgProcess = spawn(process.execPath, [pkgBin, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false
    });
    
    pkgProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });
    
    pkgProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });

    pkgProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderr || stdout || `pkg exited with code ${code}`;
        reject(new Error(errorMsg));
      }
    });

    pkgProcess.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Package an ewvjs application into a standalone executable
 * @param {Object} config - Packaging configuration
 * @param {string} config.entry - Entry point file path
 * @param {string} config.output - Output executable name (without .exe)
 * @param {string} config.assets - Assets directory path
 * @param {string} config.icon - Icon file path (.ico)
 * @param {string} config.name - Application name
 * @param {string} config.target - Target platform (e.g., node18-win-x64)
 * @param {boolean} config.compress - Whether to compress with UPX
 * @param {boolean} config.includeNative - Whether to include native DLLs
 * @param {string[]} config.additionalModules - Additional node modules to bundle
 */
async function packageApp(config) {
  const {
    entry,
    output,
    assets,
    icon,
    name,
    target,
    compress,
    includeNative = true,
    additionalModules = []
  } = config;

  const outputDir = path.join(process.cwd(), 'dist');
  const outputPath = path.join(outputDir, `${output}.exe`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('📝 Configuration:');
  console.log(`   Entry: ${entry}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Target: ${target}`);
  console.log(`   Compress: ${compress ? 'Yes' : 'No'}`);
  if (assets && fs.existsSync(assets)) {
    console.log(`   Assets: ${assets}`);
  }
  if (icon) {
    console.log(`   Icon: ${icon}`);
  }
  if (additionalModules.length > 0) {
    console.log(`   Additional Modules: ${additionalModules.join(', ')}`);
  }
  console.log('');

  // Step 1: Package with @yao-pkg/pkg
  console.log('🔨 Step 1: Creating executable with pkg...');
  
  const pkgArgs = [
    entry,
    '--target', target,
    '--output', outputPath,
    '--public',  // Faster, includes sources
    '--no-bytecode'  // Skip bytecode generation for faster packaging
  ];

  if (compress) {
    pkgArgs.push('--compress', 'GZip');
  }

  // Add pkg configuration for native modules
  const pkgConfig = {
    assets: []
  };

  // Include native DLLs if requested
  if (includeNative) {
    const ewvjsPath = require.resolve('ewvjs');
    const ewvjsRoot = path.dirname(path.dirname(ewvjsPath));
    const nativePath = path.join(ewvjsRoot, 'native');
    
    if (fs.existsSync(nativePath)) {
      console.log('   Including native DLLs from ewvjs...');
      pkgConfig.assets.push(`${nativePath}/**/*`);
    }
  }

  // Write temporary pkg config
  const pkgConfigPath = path.join(process.cwd(), '.pkg-config.json');
  fs.writeFileSync(pkgConfigPath, JSON.stringify(pkgConfig, null, 2));

  try {
    // Execute pkg using spawn
    await runPkg(pkgArgs);
    console.log('   ✓ Executable created');
    
    // Convert to GUI application (hide console window)
    console.log('   Converting to GUI application...');
    convertToGuiApp(outputPath);
    console.log('   ✓ Converted to GUI app (no console window)');
    
    // Clean up temp config
    if (fs.existsSync(pkgConfigPath)) {
      fs.unlinkSync(pkgConfigPath);
    }
  } catch (error) {
    // Clean up temp config on error
    if (fs.existsSync(pkgConfigPath)) {
      fs.unlinkSync(pkgConfigPath);
    }
    throw new Error(`pkg failed: ${error.message}`);
  }

  // Step 2: Copy native DLLs next to executable
  if (includeNative) {
    console.log('\n🔧 Step 2: Copying native dependencies...');
    const ewvjsPath = require.resolve('ewvjs');
    const ewvjsRoot = path.dirname(path.dirname(ewvjsPath));
    const nativePath = path.join(ewvjsRoot, 'native');
    
    if (fs.existsSync(nativePath)) {
      const targetNativePath = path.join(outputDir, 'native');
      
      // Copy directory recursively
      copyRecursive(nativePath, targetNativePath);
      console.log(`   ✓ Native DLLs copied to ${targetNativePath}`);
      
      // Copy additional node modules if specified
      if (additionalModules.length > 0) {
        console.log('\n   📦 Copying additional node modules...');
        const targetNodeModulesPath = path.join(targetNativePath, 'node_modules');
        const copiedModules = new Set();
        
        /**
         * Recursively copy module and its dependencies
         */
        function copyModuleWithDependencies(moduleName, depth = 0) {
          const indent = '      ' + '  '.repeat(depth);
          
          // Avoid copying the same module twice
          if (copiedModules.has(moduleName)) {
            return;
          }
          
          try {
            // Try to resolve the module from the current project
            const modulePath = require.resolve(moduleName + '/package.json', {
              paths: [process.cwd()]
            });
            const moduleRoot = path.dirname(modulePath);
            const moduleDestPath = path.join(targetNodeModulesPath, moduleName);
            
            // Mark as copied before processing to avoid circular dependencies
            copiedModules.add(moduleName);
            
            // Copy the module
            copyRecursive(moduleRoot, moduleDestPath);
            console.log(`${indent}✓ Copied ${moduleName}`);
            
            // Read package.json to get dependencies
            const packageJsonPath = path.join(moduleRoot, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
              const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
              const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.optionalDependencies
              };
              
              // Recursively copy dependencies
              if (dependencies && Object.keys(dependencies).length > 0) {
                for (const depName of Object.keys(dependencies)) {
                  copyModuleWithDependencies(depName, depth + 1);
                }
              }
            }
          } catch (error) {
            if (depth === 0) {
              // Only warn for top-level modules
              console.warn(`${indent}⚠ Warning: Could not find module "${moduleName}": ${error.message}`);
            }
            // Skip missing optional dependencies silently
          }
        }
        
        // Copy each requested module with its dependencies
        for (const moduleName of additionalModules) {
          copyModuleWithDependencies(moduleName, 0);
        }
        
        console.log(`      Total modules copied: ${copiedModules.size}`);
      }
    } else {
      console.warn('   ⚠ Warning: Native DLLs not found in ewvjs installation');
    }
  }

  // Step 3: Bundle assets if provided
  if (assets && fs.existsSync(assets)) {
    console.log('\n📦 Step 3: Bundling assets...');
    const assetsOutput = path.join(outputDir, 'assets');
    await bundleAssets(assets, assetsOutput);
    console.log(`   ✓ Assets bundled to ${assetsOutput}`);
  }

  // Step 4: Set icon if provided
  if (icon && fs.existsSync(icon)) {
    console.log('\n🎨 Step 4: Setting application icon...');
    await setIcon(outputPath, icon, name);
    console.log('   ✓ Icon applied');
  }

  return outputPath;
}

/**
 * Copy directory recursively
 */
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = packageApp;
