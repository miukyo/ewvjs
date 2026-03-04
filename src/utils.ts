/**
 * Extracts parameter names from a function
 */
export function getParamNames(func: Function): string[] {
    const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    const fnStr = func.toString().replace(STRIP_COMMENTS, '');
    
    // Handle arrow functions: name => ... or (name) => ... or (a, b) => ...
    // Handle regular functions: function name(a, b) { ... }
    // Handle async functions: async (a, b) => ... or async function(a, b) { ... }
    
    let paramsStr = '';
    
    // Check for arrow function
    const arrowIndex = fnStr.indexOf('=>');
    if (arrowIndex !== -1) {
        // Arrow function
        const beforeArrow = fnStr.slice(0, arrowIndex).trim();
        
        // Check if parameters are in parentheses
        const lastOpenParen = beforeArrow.lastIndexOf('(');
        if (lastOpenParen !== -1) {
            // Parameters are like (a, b) or (a: string, b: number)
            const lastCloseParen = beforeArrow.lastIndexOf(')');
            paramsStr = beforeArrow.slice(lastOpenParen + 1, lastCloseParen);
        } else {
            // Single parameter without parentheses: name => ...
            // Remove 'async' if present
            paramsStr = beforeArrow.replace(/^\s*async\s+/, '').trim();
        }
    } else {
        // Regular function
        const openParen = fnStr.indexOf('(');
        const closeParen = fnStr.indexOf(')', openParen);
        if (openParen !== -1 && closeParen !== -1) {
            paramsStr = fnStr.slice(openParen + 1, closeParen);
        }
    }
    
    if (!paramsStr) return [];
    
    // Split by comma and extract just the parameter names (strip types and default values)
    return paramsStr.split(',').map(param => {
        // Remove type annotations (everything after :)
        // Remove default values (everything after =)
        // Remove whitespace and rest/spread operators
        return param
            .replace(/\s*:.*?(?=,|$)/g, '') // Remove TypeScript types
            .replace(/\s*=.*?(?=,|$)/g, '')  // Remove default values
            .replace(/\s+/g, '')              // Remove whitespace
            .replace(/^\.\.\./, '');          // Remove rest operator
    }).filter(name => name.length > 0);
}

/**
 * Generates a random ID for menu items
 */
export function generateId(): string {
    return `menu_item_${Math.random().toString(36).substr(2, 9)}`;
}
