// Setup module resolution for node-api-dotnet BEFORE any imports
import * as path from 'path';
import * as fs from 'fs';

const isPkg = typeof (process as any).pkg !== 'undefined';
if (isPkg) {
    const execDir = path.dirname(process.execPath);
    const dllDir = path.join(execDir, 'native');
    const nodeModulesPath = path.join(dllDir, 'node_modules');
    
    if (fs.existsSync(nodeModulesPath)) {
        // Set NODE_PATH environment variable
        const existingNodePath = process.env.NODE_PATH || '';
        process.env.NODE_PATH = existingNodePath 
            ? `${nodeModulesPath};${existingNodePath}` 
            : nodeModulesPath;
        
        // Since pkg locks Module properties, we need to intercept requires at a higher level
        // Add the node_modules path to require.resolve paths by modifying module.paths
        // This needs to be done for every module, so we'll hook into the module creation
        if (typeof (require as any).main !== 'undefined' && (require as any).main.paths) {
            (require as any).main.paths.unshift(nodeModulesPath);
        }
    }
}

// Export types
export * from './types';

// Export classes
export { WebView } from './webview';
export { Window } from './window';

// Create and export singleton instance
import { WebView } from './webview';

const ewvjs = new WebView();
export default ewvjs;

// Export convenience functions
export const create_window = ewvjs.create_window.bind(ewvjs);
export const start = ewvjs.start.bind(ewvjs);
export const expose = ewvjs.expose.bind(ewvjs);
