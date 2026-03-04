import { WindowsPlatform } from "./platforms/windows.js";
import { Window } from "./window.js";
import { WindowOptions } from "./types.js";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import mime from "mime-types";
import { execSync } from "child_process";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebView {
	platform: any;
	exposed_functions: { [key: string]: Function } = {};
	private _windows: Set<Window> = new Set();
	private _startPromise: Promise<void> | null = null;
	private _resolveStart: (() => void) | null = null;
	private _heartbeat: NodeJS.Timeout | null = null;
	private _resolveOnce: boolean = false;
	private _httpServers: Map<string, http.Server> = new Map();

	constructor() {
		if (process.platform === "win32") {
			this.platform = new WindowsPlatform();
		} else {
			throw new Error("Platform not supported: " + process.platform);
		}
	}

	create_window(
		title: string,
		url_or_html: string = "",
		options: Partial<WindowOptions> = {},
	): Window {
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
		this._heartbeat = setInterval(() => {}, 1000);

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

		// Close all HTTP servers
		for (const [_, server] of this._httpServers) {
			server.close();
		}
		this._httpServers.clear();

		if (this._resolveStart) {
			this._resolveStart();
			this._resolveOnce = true;
			this._resolveStart = null;
		}

		// Force exit after a short delay to ensure cleanup completes
		if (this._resolveOnce) {
			setTimeout(() => {
				process.exit(0);
			}, 100);
		}
	}
	expose(name: string, func: Function): void {
		this.exposed_functions[name] = func;
	}

	async _handle_message(message: any): Promise<void> {
		if (!message) return;
	}

	private _getMimeType(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase();
		return mime.lookup(ext) || "application/octet-stream";
	}

	private _findFreePort(): number {
		// Use execSync to find a free port synchronously
		const script = `
            import net from 'net';
            const server = net.createServer();
            server.listen(0, 'localhost', () => {
                console.log(server.address().port);
                server.close();
            });
        `;

		try {
			const output = execSync(
				`node --input-type=module -e "${script.replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
				{
					encoding: "utf-8",
					timeout: 5000,
				},
			);
			const port = parseInt(output.trim(), 10);
			if (isNaN(port)) {
				throw new Error("Failed to parse port");
			}
			return port;
		} catch (err) {
			// Fallback to port range
			return 3000 + Math.floor(Math.random() * 1000);
		}
	}

	private _createHttpServer(filePath: string): string {
		// Check if server already exists for this file
		if (this._httpServers.has(filePath)) {
			const existingPort = Array.from(this._httpServers.entries()).find(
				([path, _]) => path === filePath,
			);
			if (existingPort) {
				const addr = existingPort[1].address();
				if (addr && typeof addr === "object") {
					return `http://localhost:${addr.port}`;
				}
			}
		}

		// Resolve relative paths from the main script's directory, not CWD
		let absolutePath: string;

        // In ESM, use process.argv[1] to get the main script path
        let mainDir: string;
        if (process.argv[1]) {
            mainDir = path.dirname(process.argv[1]);
        } else {
            mainDir = process.cwd();
        }
        absolutePath = path.resolve(mainDir, filePath);

        console.log(`Serving ${absolutePath} at ${filePath}`);

		const dir = path.dirname(absolutePath);
		const fileName = path.basename(absolutePath);

		// Find a free port first
		const port = this._findFreePort();

		const server = http.createServer((req, res) => {
			const requestPath = req.url === "/" ? fileName : req.url!.substring(1);
			const fullPath = path.join(dir, requestPath);
			fs.readFile(fullPath, (err, data) => {
				if (err) {
					res.writeHead(404);
					res.end("File not found");
					return;
				}

				const mimeType = this._getMimeType(fullPath);
				if (mimeType) {
					res.writeHead(200, { "Content-Type": mimeType });
				} else {
					res.writeHead(200);
				}
				res.end(data);
			});
		});

		// Use the pre-allocated port
		server.listen(port, "localhost");
		this._httpServers.set(filePath, server);

		return `http://localhost:${port}`;
	}

	private _buildWindowOptions(
		title: string,
		url_or_html: string,
		options: Partial<WindowOptions>,
	): WindowOptions {
		const opts: WindowOptions = {
			title: title,
			width: options.width || 800,
			height: options.height || 600,
			resizable: options.resizable !== undefined ? options.resizable : true,
			session: {
				persist:
					options.session?.persist !== undefined
						? options.session.persist
						: true,
				path: options.session?.path,
				envname: options.session?.envname,
			},
			jsCallback: this._handle_message.bind(this),
			...options,
		};

		const urlRegex = /^(http?|file?|data?):/i;
		const isUrl =
			urlRegex.test(url_or_html) ||
			/^localhost(:\d+)?$/i.test(url_or_html) ||
			/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(url_or_html);

		if (isUrl) {
			opts.url = url_or_html;
		} else if (url_or_html.toLowerCase().endsWith(".html")) {
			// If it's an HTML file path, serve it via HTTP server
			opts.url = this._createHttpServer(url_or_html);
		} else {
			opts.html = url_or_html;
		}

		return opts;
	}
}
