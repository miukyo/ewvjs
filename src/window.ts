import { ContextMenuItem, WindowOptions } from './types';
import { getParamNames, generateId } from './utils';

export class Window {
    platform: any;
    options: WindowOptions;

    private controller: any;
    private _closedPromise: Promise<void>;
    private _resolveClosed!: () => void;
    private _menuCallbacks: Map<string, () => void> = new Map();
    private _exposedFunctions: { [key: string]: Function };
    private _isClosed: boolean = false;

    on_context_menu: (items: any[]) => ContextMenuItem[] | null | Promise<ContextMenuItem[] | null> = () => null;

    constructor(platform: any, options: WindowOptions, exposedFunctions: { [key: string]: Function }) {
        this.platform = platform;
        this.options = { ...options };
        this._exposedFunctions = exposedFunctions;

        this._closedPromise = new Promise((resolve) => {
            this._resolveClosed = resolve;
        });

        const originalCallback = this.options.jsCallback;
        this.options.jsCallback = async (msg) => {
            const result = await this._on_message(msg, this._exposedFunctions);
            if (originalCallback) await originalCallback(msg);
            return result;
        };
    }

    get closed() {
        return this._closedPromise;
    }

    get is_closed() {
        return this._isClosed;
    }

    async run() {
        this.controller = await this.platform.createWindow(this.options);
        
        // Inject exposed functions API
        const funcList = Object.keys(this._exposedFunctions).map(name => {
            return { func: name, params: getParamNames(this._exposedFunctions[name]) };
        });

        if (funcList.length > 0) {
            const code = `if (window.ewvjs) { window.ewvjs._createApi(${JSON.stringify(funcList)}); }`;
            setTimeout(() => this.evaluate_js(code).catch((err) => { 
                console.error('Failed to inject exposed functions API:', err);
            }), 500);
        }

        return this.controller;
    }

    private async _call(method: string, payload: any = null): Promise<any> {
        if (this._isClosed) {
            console.warn(`Cannot call ${method}: Window is closed`);
            return null;
        }
        
        if (!this.controller || !this.controller[method]) {
            throw new Error(`Window not running or ${method} not supported`);
        }
        
        try {
            const result = this.controller[method](payload);
            
            // Check if method returns a Promise (node-api-dotnet JSCallback style)
            if (result && typeof result.then === 'function') {
                return result;
            } else {
                return result;
            }
        } catch (err: any) {
            // If window was closed mid-operation, mark as closed and return null
            if (err && err.message && err.message.includes('Window not initialized')) {
                this._isClosed = true;
                console.warn(`Window was closed during ${method} call`);
                return null;
            }
            throw err;
        }
    }

    // Core methods
    async evaluate_js(script: string): Promise<any> {
        return this._call('evaluate', script);
    }

    async evaluate(script: string): Promise<any> { 
        return this.evaluate_js(script); 
    }

    async close() {
        if (this._isClosed) return;
        this._isClosed = true;
        const result = await this._call('close');
        this._resolveClosed();
        return result;
    }

    async destroy() {
        return this._call('close');
    }

    // Window state methods
    async maximize() { return this._call('maximize'); }
    async restore() { return this._call('restore'); }
    async minimize() { return this._call('minimize'); }
    async focus() { return this._call('focus'); }
    async blur() { return this._call('blur'); }
    async show() { return this._call('show'); }
    async hide() { return this._call('hide'); }

    // Size and position methods
    async getSize() { return this._call('getSize'); }
    async setSize(width: number, height: number) { 
        return this._call('setSize', { width, height }); 
    }
    async resize(width: number, height: number) { 
        return this._call('setSize', { width, height }); 
    }

    async getPosition() { return this._call('getPosition'); }
    async setPosition(x: number, y: number) { 
        return this._call('setPosition', { x, y }); 
    }
    async move(x: number, y: number) { 
        return this._call('move', { x, y }); 
    }

    async get_position() { return this._call('getPosition'); }
    async set_position(x: number, y: number) { 
        return this._call('setPosition', { x, y }); 
    }

    async get_width(): Promise<number> {
        const size: any = await this._call('getSize');
        return size.width;
    }

    async get_height(): Promise<number> {
        const size: any = await this._call('getSize');
        return size.height;
    }

    // Title methods
    async setTitle(title: string) { 
        return this._call('setTitle', title); 
    }
    async set_title(title: string) { 
        return this._call('setTitle', title); 
    }

    // Title bar methods
    async show_titlebar() { return this._call('setTitleBar', true); }
    async hide_titlebar() { return this._call('setTitleBar', false); }

    // Icon methods
    async setIcon(iconPath: string) {
        return this._call('setIcon', iconPath);
    }

    // Cookie methods
    async get_cookies() { return this._call('getCookies'); }
    async set_cookie(name: string, value: string, domain: string = '', path: string = '/') {
        return this._call('setCookie', { name, value, domain, path });
    }
    async clear_cookies() { return this._call('clearCookies'); }

    private async _on_message(message: any, exposedFunctions: { [key: string]: Function }) {
        try {
            const data = typeof message === 'string' ? JSON.parse(message) : message;
            if (!Array.isArray(data)) return null;

            const funcName = data[0];
            const rawParams = data[1];
            const id = data[2];
            
            const params = this._parseParams(rawParams);

            // Handle special messages
            if (funcName === 'closed') {
                this._isClosed = true;
                this._resolveClosed();
                return null;
            }

            if (funcName === 'console') {
                console.log('WebView Console:', ...params);
                return null;
            }

            if (funcName === 'menu_click') {
                return this._handleMenuClick(params);
            }

            if (funcName === 'context_menu_requested') {
                return this._handleContextMenu(params);
            }

            // Handle exposed function calls
            return this._handleExposedFunction(funcName, params, id, exposedFunctions);
        } catch (e) { 
            return null;
        }
    }

    private _parseParams(rawParams: any): any[] {
        let params: any[] = [];

        if (rawParams) {
            if (typeof rawParams === 'string' && (rawParams.startsWith('[') || rawParams.startsWith('{'))) {
                try {
                    const parsed = JSON.parse(rawParams);
                    params = Array.isArray(parsed) ? parsed : [parsed];
                } catch (e) {
                    params = [rawParams];
                }
            } else {
                params = Array.isArray(rawParams) ? rawParams : [rawParams];
            }
        }

        return params;
    }

    private _handleMenuClick(params: any[]): null {
        const callbackId = params[0];
        const callback = this._menuCallbacks.get(callbackId);
        if (callback) callback();
        return null;
    }

    private async _handleContextMenu(params: any[]): Promise<ContextMenuItem[] | null> {
        if (this.on_context_menu) {
            const customMenu = await this.on_context_menu(params);
            if (customMenu) {
                return this._processMenu(customMenu);
            }
        }
        return null;
    }

    private async _handleExposedFunction(
        funcName: string, 
        params: any[], 
        id: string,
        exposedFunctions: { [key: string]: Function }
    ): Promise<any> {
        const func = exposedFunctions[funcName];
        if (!func) return null;

        try {
            const result = await func(...params);
            await this._sendSuccessResponse(funcName, id, result);
            return result !== undefined ? result : null;
        } catch (err: any) {
            await this._sendErrorResponse(funcName, id, err);
            return null;
        }
    }

    private async _sendSuccessResponse(funcName: string, id: string, result: any): Promise<void> {
        const resJson = JSON.stringify(result);
        const code = `window.ewvjs._returnValuesCallbacks["${funcName}"]["${id}"]({value: ${JSON.stringify(resJson)}, isError: false})`;
        await this.evaluate_js(code);
    }

    private async _sendErrorResponse(funcName: string, id: string, err: any): Promise<void> {
        const errObj = { message: err.message, name: err.name, stack: err.stack };
        const code = `window.ewvjs._returnValuesCallbacks["${funcName}"]["${id}"]({value: ${JSON.stringify(JSON.stringify(errObj))}, isError: true})`;
        await this.evaluate_js(code);
    }

    private _processMenu(menu: ContextMenuItem[]): ContextMenuItem[] {
        return menu.map((item) => {
            const newItem = { ...item };
            
            if (newItem.click) {
                const id = newItem.id || generateId();
                newItem.id = id;
                this._menuCallbacks.set(id, newItem.click);
                delete newItem.click;
            }
            
            if (newItem.submenu) {
                newItem.submenu = this._processMenu(newItem.submenu);
            }
            
            return newItem;
        });
    }
}
