import { WindowsPlatform } from "./platforms/windows.js";
import { Window } from "./window.js";
import { WindowOptions } from "./types.js";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import mime from "mime-types";
import { fileURLToPath } from 'url';
import * as child_process from 'child_process';

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

	async autoUpdateFromManifest(manifestUrl: string): Promise<{ updated: boolean; version?: string; error?: string }> {
		try {
			const manifestData = await this._fetchJson(manifestUrl);
			if (!manifestData || !manifestData.url) {
				return { updated: false, error: 'Invalid manifest: missing url' };
			}

			const downloadUrl: string = manifestData.url;
			const version: string | undefined = manifestData.version;

			// download zip to temp file
			const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ewvjs-update-'));
			const zipPath = path.join(tmpDir, 'update.zip');
			await this._downloadFile(downloadUrl, zipPath);

			// extract zip to temp extract dir
			const extractDir = path.join(tmpDir, 'extracted');
			fs.mkdirSync(extractDir);
			// Use system `tar` to extract the downloaded archive. Fail if tar is not available.
			try {
				child_process.execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'ignore' });
			} catch (e: any) {
				return { updated: false, error: 'Extraction failed: system tar not available or failed: ' + (e && e.message ? e.message : String(e)) };
			}

			// determine target dir
			const isPkg = typeof (process as any).pkg !== 'undefined';
			const targetDir = isPkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
			const restartExe = process.execPath;
			const restartArgsJson = JSON.stringify(process.argv.slice(1));
			const helperScriptPath = path.join(tmpDir, 'ewvjs-update-helper.ps1');
			fs.writeFileSync(helperScriptPath, this._buildUpdateHelperScript(), 'utf8');

			const helper = child_process.spawn(
				'powershell.exe',
				[
					'-NoProfile',
					'-ExecutionPolicy',
					'Bypass',
					'-File',
					helperScriptPath,
					extractDir,
					targetDir,
					String(process.pid),
					restartExe,
					restartArgsJson,
					targetDir,
				],
				{ detached: true, stdio: 'ignore' },
			);
			helper.unref();

			return { updated: true, version };
		} catch (err: any) {
			return { updated: false, error: err && err.message ? err.message : String(err) };
		}
	}

	private _buildUpdateHelperScript(): string {
		return `param(
	[string]\$StagingDir,
	[string]\$TargetDir,
	[int]\$MainPid,
	[string]\$RestartExe,
	[string]\$RestartArgsJson,
	[string]\$WorkingDir
)

\$ErrorActionPreference = 'Stop'

while ($true) {
	try {
		Get-Process -Id \$MainPid -ErrorAction Stop | Out-Null
		Start-Sleep -Milliseconds 250
	} catch {
		break
	}
}

Start-Sleep -Milliseconds 500

\$parentDir = Split-Path -Path \$TargetDir -Parent
\$targetName = Split-Path -Path \$TargetDir -Leaf
\$backupDir = Join-Path -Path \$parentDir -ChildPath ($targetName + '.bak.' + ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))

if (Test-Path -LiteralPath \$backupDir) {
	Remove-Item -LiteralPath \$backupDir -Recurse -Force
}

try {
	Move-Item -LiteralPath \$TargetDir -Destination \$backupDir
	Move-Item -LiteralPath \$StagingDir -Destination \$TargetDir

	\$restartArgs = @()
	if (-not [string]::IsNullOrWhiteSpace(\$RestartArgsJson)) {
		\$restartArgs = \$RestartArgsJson | ConvertFrom-Json
	}

	Start-Process -FilePath \$RestartExe -ArgumentList \$restartArgs -WorkingDirectory \$WorkingDir
} catch {
	if ((Test-Path -LiteralPath \$backupDir) -and -not (Test-Path -LiteralPath \$TargetDir)) {
		Move-Item -LiteralPath \$backupDir -Destination \$TargetDir -Force
	}
	throw
}`;
	}

	private _fetchJson(urlStr: string): Promise<any> {
		return new Promise((resolve, reject) => {
			const client = urlStr.startsWith('https:') ? https : http;
			client.get(urlStr, (res) => {
				let data = '';
				res.on('data', (chunk) => (data += chunk));
				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch (e) {
						reject(e);
					}
				});
			}).on('error', reject);
		});
	}

	private _downloadFile(urlStr: string, destPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const client = urlStr.startsWith('https:') ? https : http;
			const file = fs.createWriteStream(destPath);
			const req = client.get(urlStr, (res) => {
				if (res.statusCode && res.statusCode >= 400) {
					file.close();
					return reject(new Error('Download failed: ' + res.statusCode));
				}
				res.pipe(file);
				file.on('finish', () => {
					file.close();
					resolve();
				});
			});
			req.on('error', (err) => {
				file.close();
				reject(err);
			});
		});
	}

	async create_window(
		title: string,
		url_or_html: string = "",
		options: Partial<WindowOptions> = {},
	): Promise<Window> {
		const opts = await this._buildWindowOptions(title, url_or_html, options);
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
			this._resolveStart = null;
		}

		// Force exit after a short delay to ensure cleanup completes.
		// This keeps the process from hanging after the last window is closed,
		// even when start() was never awaited.
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

	private _getMimeType(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase();
		return mime.lookup(ext) || "application/octet-stream";
	}

	private _createHttpServer(filePath: string): Promise<string> {
		// Return cached server URL if already serving this file
		if (this._httpServers.has(filePath)) {
			const existing = this._httpServers.get(filePath)!;
			const addr = existing.address();
			if (addr && typeof addr === "object") {
				return Promise.resolve(`http://localhost:${addr.port}`);
			}
		}

		// Resolve the file path relative to the main script directory
		const mainDir = process.argv[1]
			? path.dirname(process.argv[1])
			: process.cwd();
		const absolutePath = path.resolve(mainDir, filePath);

		const dir = path.dirname(absolutePath);
		const fileName = path.basename(absolutePath);

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

		// listen(0) asks the OS to assign a free port instantly — no external process needed
		return new Promise((resolve, reject) => {
			server.on("error", reject);
			server.listen(0, "localhost", () => {
				const addr = server.address() as { port: number };
				this._httpServers.set(filePath, server);
				resolve(`http://localhost:${addr.port}`);
			});
		});
	}

	private async _buildWindowOptions(
		title: string,
		url_or_html: string,
		options: Partial<WindowOptions>,
	): Promise<WindowOptions> {
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

		const urlRegex = /^(https?|file|data):/i;
		const isUrl =
			urlRegex.test(url_or_html) ||
			/^localhost(:\d+)?$/i.test(url_or_html) ||
			/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(url_or_html);

		if (isUrl) {
			opts.url = url_or_html;
		} else if (url_or_html.toLowerCase().endsWith(".html")) {
			// Serve the HTML file via a local HTTP server;
			// listen(0) lets the OS pick a free port with zero overhead
			opts.url = await this._createHttpServer(url_or_html);
		} else {
			opts.html = url_or_html;
		}

		return opts;
	}
}
