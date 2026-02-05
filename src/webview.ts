import { WindowsPlatform } from './platforms/windows';
import { Window } from './window';
import { WindowOptions } from './types';

export class WebView {
    platform: any;
    exposed_functions: { [key: string]: Function } = {};
    private _windows: Set<Window> = new Set();
    private _startPromise: Promise<void> | null = null;
    private _resolveStart: (() => void) | null = null;
    private _heartbeat: NodeJS.Timeout | null = null;

    constructor() {
        if (process.platform === 'win32') {
            this.platform = new WindowsPlatform();
        } else {
            throw new Error('Platform not supported: ' + process.platform);
        }
    }

    create_window(title: string, url_or_html: string = '', options: Partial<WindowOptions> = {}): Window {
        const opts = this._buildWindowOptions(title, url_or_html, options);
        const window = new Window(this.platform, opts, this.exposed_functions);
        
        this._windows.add(window);
        
        window.closed.then(() => {
            this._windows.delete(window);
            if (this._windows.size === 0) {
                this._cleanup();
            }
        });

        return window;
    }

    async start(): Promise<void> {
        if (this._windows.size === 0) return;
        
        // Keep process alive while windows are open
        this._heartbeat = setInterval(() => { }, 1000);

        this._startPromise = new Promise((resolve) => {
            this._resolveStart = resolve;
        });

        return this._startPromise;
    }

    private _cleanup(): void {
        if (this._heartbeat) {
            clearInterval(this._heartbeat);
            this._heartbeat = null;
        }
        if (this._resolveStart) {
            this._resolveStart();
            this._resolveStart = null;
        }
        
        // Force exit after a short delay to ensure cleanup completes
        setTimeout(() => {
            process.exit(0);
        }, 100);
    }

    expose(name: string, func: Function): void {
        this.exposed_functions[name] = func;
    }

    async _handle_message(message: any): Promise<void> {
        if (!message) return;
    }

    private _buildWindowOptions(
        title: string, 
        url_or_html: string, 
        options: Partial<WindowOptions>
    ): WindowOptions {
        const opts: WindowOptions = {
            title: title,
            width: options.width || 800,
            height: options.height || 600,
            resizable: options.resizable !== undefined ? options.resizable : true,
            session: {
                persist: options.session?.persist !== undefined ? options.session.persist : true,
                path: options.session?.path,
                envname: options.session?.envname
            },
            jsCallback: this._handle_message.bind(this),
            ...options
        };

        if (url_or_html.startsWith('http') || url_or_html.startsWith('data:')) {
            opts.url = url_or_html;
        } else {
            opts.html = url_or_html;
        }

        return opts;
    }
}
