#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { input, select } from '@inquirer/prompts';
import packageApp from '../lib/packager.js';
import { setIcon } from '../lib/icon.js';
import { getAvailableTemplates, copyTemplate, isValidTemplate } from '../lib/templates.js';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const program = new Command();

program
  .name('ewv')
  .description('CLI tool for packaging ewvjs applications')
  .version(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version);

program
  .command('package')
  .description('Package your ewvjs application into a standalone executable')
  .argument('<entry>', 'Entry point JavaScript file (e.g., app.js)')
  .option('-o, --output <name>', 'Output executable name', 'app')
  .option('-a, --assets <dir>', 'Assets directory to include (e.g., ./assets)', './assets')
  .option('-i, --icon <file>', 'Application icon (.ico file)')
  .option('-n, --name <name>', 'Application name', 'My App')
  .option('-t, --target <target>', 'Target platform', 'node18-win-x64')
  .option('-m, --modules <modules>', 'Additional node modules to bundle (comma-separated, e.g., "axios,lodash")')
  .option('--compress', 'Compress the executable with UPX', false)
  .option('--no-native', 'Skip bundling native DLLs (use if already included)')
  .action(async (entry, options) => {
    try {
      console.log('📦 Packaging ewvjs application...\n');

      // Validate entry file exists
      const entryPath = path.resolve(process.cwd(), entry);
      if (!fs.existsSync(entryPath)) {
        console.error(`❌ Error: Entry file not found: ${entry}`);
        process.exit(1);
      }

      // Validate icon if provided
      if (options.icon) {
        const iconPath = path.resolve(process.cwd(), options.icon);
        if (!fs.existsSync(iconPath)) {
          console.error(`❌ Error: Icon file not found: ${options.icon}`);
          process.exit(1);
        }
        if (!iconPath.endsWith('.ico')) {
          console.error('❌ Error: Icon must be a .ico file');
          process.exit(1);
        }
      }

      // Parse additional modules if provided
      const additionalModules = options.modules
        ? options.modules.split(',').map(m => m.trim()).filter(m => m)
        : [];

      const config = {
        entry: entryPath,
        output: options.output,
        assets: options.assets ? path.resolve(process.cwd(), options.assets) : null,
        icon: options.icon ? path.resolve(process.cwd(), options.icon) : null,
        name: options.name,
        target: options.target,
        compress: options.compress,
        includeNative: options.native,
        additionalModules: additionalModules
      };

      await packageApp(config);

      console.log('\n✅ Packaging complete!');
      console.log(`📁 Output folder: ${path.join(process.cwd(), 'dist')}`);
      console.log(`📦 Archive: ${path.join(process.cwd(), options.output + '.zip')}`);

    } catch (error) {
      console.error('\n❌ Packaging failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new ewvjs project')
  .argument('[name]', 'Project name')
  .option('-t, --template <template>', 'Template to use (minimal, basic, advanced)')
  .option('-l, --list-templates', 'List available templates')
  .action(async (name, options) => {
    // Handle list templates option
    if (options.listTemplates) {
      console.log('📋 Available templates:\n');
      const templates = getAvailableTemplates();
      templates.forEach(t => {
        const isDefault = t.name === 'basic' ? ' (default)' : '';
        console.log(`  ${t.name}${isDefault}`);
        console.log(`    ${t.description}\n`);
      });
      console.log('Usage: ewv init <project-name> --template <template-name>');
      return;
    }

    const templates = getAvailableTemplates();
    const answers = {};

    // Prompt for project name if not provided
    if (!name) {
      answers.projectName = await input({
        message: 'Project name:',
        default: 'my-ewvjs-app',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Project name is required';
          }
          if (fs.existsSync(path.join(process.cwd(), value))) {
            return `Directory ${value} already exists`;
          }
          return true;
        }
      });
    } else {
      answers.projectName = name;
    }

    // Prompt for template if not provided
    if (!options.template) {
      answers.template = await select({
        message: 'Select a template:',
        choices: templates.map(t => ({
          name: `${t.name} - ${t.description}`,
          value: t.name
        })),
        default: 'basic'
      });
    } else {
      answers.template = options.template;
    }

    const projectDir = path.join(process.cwd(), answers.projectName);

    // Validate template
    if (!isValidTemplate(answers.template)) {
      console.error(`❌ Error: Template "${answers.template}" not found`);
      console.log('\nAvailable templates:');
      templates.forEach(t => {
        console.log(`  - ${t.name}: ${t.description}`);
      });
      process.exit(1);
    }

    if (fs.existsSync(projectDir)) {
      console.error(`❌ Error: Directory ${answers.projectName} already exists`);
      process.exit(1);
    }

    console.log(`\n📂 Creating new ewvjs project: ${answers.projectName}`);
    console.log(`📝 Using template: ${answers.template}\n`);

    try {
      // Copy template to project directory
      copyTemplate(answers.template, answers.projectName, projectDir);

      console.log('✅ Project created successfully!\n');
      console.log('Next steps:');
      console.log(`  cd ${answers.projectName}`);
      console.log('  npm install');
      console.log('  npm start\n');
    } catch (error) {
      console.error(`❌ Error creating project: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
