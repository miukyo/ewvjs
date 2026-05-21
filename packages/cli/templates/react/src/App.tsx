import { useState, useEffect, useCallback } from 'react';
import './App.css';

interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  uptime: number;
  memory: number;
}

// Typing for window.ewvjs to avoid casting and resolve eslint / typescript explicit any warnings
declare global {
  interface Window {
    ewvjs?: {
      greet?: (name: string) => Promise<string>;
      getSystemInfo?: () => Promise<SystemInfo>;
    };
  }
}

function App() {
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSystemInfo = useCallback(async () => {
    const ewvjs = window.ewvjs;
    if (ewvjs && ewvjs.getSystemInfo) {
      setIsRefreshing(true);
      try {
        const info = await ewvjs.getSystemInfo();
        setSystemInfo(info);
      } catch (err) {
        console.error('Failed to fetch system info:', err);
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    } else {
      // Graceful fallback for browser/vite preview environment (run asynchronously to avoid synchronous effect warnings)
      Promise.resolve().then(() => {
        setSystemInfo({
          platform: 'Browser Preview',
          arch: 'web',
          nodeVersion: 'N/A',
          uptime: performance.now() / 1000,
          memory: 0
        });
      });
    }
  }, []);

  const handleGreet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const ewvjs = window.ewvjs;
    if (ewvjs && ewvjs.greet) {
      try {
        const res = await ewvjs.greet(name);
        setGreeting(res);
      } catch (err) {
        console.error('Failed to greet:', err);
      }
    } else {
      setGreeting(`Hello, ${name}! [Browser Preview Fallback]`);
    }
  };

  useEffect(() => {
    setTimeout(fetchSystemInfo, 0);
    const interval = setInterval(fetchSystemInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchSystemInfo]);

  const formatMemory = (bytes: number) => {
    if (bytes === 0) return 'N/A';
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatUptime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="desktop-container">
      <header className="app-header">
        <div className="logo-group">
          <span className="react-icon">⚛️</span>
          <span className="plus">+</span>
          <span className="ewvjs-badge">ewvjs</span>
        </div>
        <h1>React Desktop Application</h1>
        <p className="subtitle">High-performance native desktop interfaces using Node.js & React</p>
      </header>

      <main className="app-content">
        {/* Left Card: JS Interop & Node APIs */}
        <section className="card interop-card">
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <h2>Node.js API Interop</h2>
          </div>
          <p className="card-desc">Call native Node.js APIs directly from your React components without complex ipcRenderer boilerplate.</p>
          
          <form onSubmit={handleGreet} className="greet-form">
            <div className="input-group">
              <input
                type="text"
                placeholder="Enter your name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="greet-input"
              />
              <button type="submit" className="greet-btn">
                Greet
              </button>
            </div>
          </form>

          {greeting && (
            <div className="response-box animated">
              <span className="response-badge">Node Response</span>
              <p className="response-text">{greeting}</p>
            </div>
          )}
        </section>

        {/* Right Card: Real-time System Metrics */}
        <section className="card metrics-card">
          <div className="card-header">
            <span className="card-icon">💻</span>
            <h2>System Diagnostics</h2>
            <button 
              onClick={fetchSystemInfo} 
              className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
              title="Refresh diagnostics"
            >
              🔄
            </button>
          </div>
          <p className="card-desc">Real-time operating system and application runtime metrics fetched via WebView2 host bridge.</p>

          {systemInfo ? (
            <div className="metrics-grid">
              <div className="metric-item">
                <span className="metric-label">OS Platform</span>
                <span className="metric-value capitalize">{systemInfo.platform}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Architecture</span>
                <span className="metric-value">{systemInfo.arch}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Node.js Version</span>
                <span className="metric-value">{systemInfo.nodeVersion}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Heap Memory</span>
                <span className="metric-value">{formatMemory(systemInfo.memory)}</span>
              </div>
              <div className="metric-item full-width">
                <span className="metric-label">Process Uptime</span>
                <span className="metric-value">{formatUptime(systemInfo.uptime)}</span>
              </div>
            </div>
          ) : (
            <div className="loading-state">Loading metrics...</div>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <p>Built with <strong>React 19</strong>, <strong>Vite 8</strong>, and <strong>ewvjs Desktop Shell</strong></p>
      </footer>
    </div>
  );
}

export default App;
