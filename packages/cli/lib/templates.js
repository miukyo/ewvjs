const fs = require('fs');
const path = require('path');

/**
 * Get available templates
 * @returns {Array<{name: string, description: string}>}
 */
function getAvailableTemplates() {
  const templatesDir = path.join(__dirname, '..', 'templates');
  
  const templates = [
    {
      name: 'basic',
      description: 'Basic template - Interactive app with exposed functions (default)'
    },
  ];
  
  // Filter to only existing templates
  return templates.filter(t => {
    return fs.existsSync(path.join(templatesDir, t.name));
  });
}

/**
 * Copy template to destination
 * @param {string} templateName - Template name
 * @param {string} projectName - Project name
 * @param {string} destination - Destination directory
 */
function copyTemplate(templateName, projectName, destination) {
  const templatesDir = path.join(__dirname, '..', 'templates');
  const templatePath = path.join(templatesDir, templateName);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template "${templateName}" not found`);
  }
  
  // Create destination directory
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }
  
  // Copy template files recursively
  copyTemplateRecursive(templatePath, destination, projectName);
}

/**
 * Copy template directory recursively and process template files
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @param {string} projectName - Project name for replacements
 */
function copyTemplateRecursive(src, dest, projectName) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      // Create directory and recurse
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyTemplateRecursive(srcPath, destPath, projectName);
    } else {
      // Copy and process file
      let content = fs.readFileSync(srcPath, 'utf-8');
      
      // Replace template variables
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      
      fs.writeFileSync(destPath, content, 'utf-8');
    }
  }
}

/**
 * Validate template name
 * @param {string} templateName - Template name
 * @returns {boolean}
 */
function isValidTemplate(templateName) {
  const templates = getAvailableTemplates();
  return templates.some(t => t.name === templateName);
}

module.exports = {
  getAvailableTemplates,
  copyTemplate,
  isValidTemplate
};
