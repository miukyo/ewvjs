/**
 * Extracts parameter names from a function
 */
export function getParamNames(func: Function): string[] {
    const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    const ARGUMENT_NAMES = /([^\s,]+)/g;
    const fnStr = func.toString().replace(STRIP_COMMENTS, '');
    const result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    if (result === null) return [];
    return Array.from(result);
}

/**
 * Generates a random ID for menu items
 */
export function generateId(): string {
    return `menu_item_${Math.random().toString(36).substr(2, 9)}`;
}
