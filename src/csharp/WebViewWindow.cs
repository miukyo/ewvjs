using System;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Microsoft.JavaScript.NodeApi;
using Microsoft.JavaScript.NodeApi.Interop;
using System.Linq;
using System.Reflection;
using System.Text.Json;

[JSExport]
public static class EwvjsInterop
{
    private static bool assemblyResolverRegistered = false;

    [JSExport]
    public static JSValue Invoke(JSValue inputVal)
    {
        try
        {
            // Preload all WebView2 and dependent assemblies on the JS thread
            Assembly.Load("Microsoft.Web.WebView2.Core");
            Assembly.Load("Microsoft.Web.WebView2.WinForms");
            Assembly.Load("System.Text.Json");
            Assembly.Load("System.Text.Encodings.Web");
            Assembly.Load("System.Buffers");
            Assembly.Load("System.Memory");
            Assembly.Load("System.Runtime.CompilerServices.Unsafe");
        }
        catch (Exception ex) { Console.WriteLine("Warning: Failed to preload assemblies: " + ex.Message); }

        // Set up assembly resolver to avoid JS thread issues (only once)
        if (!assemblyResolverRegistered)
        {
            AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
            {
                try
                {
                    string assemblyName = new AssemblyName(args.Name).Name ?? "";
                    string assemblyPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, assemblyName + ".dll");
                    if (File.Exists(assemblyPath))
                    {
                        return Assembly.LoadFrom(assemblyPath);
                    }
                }
                catch { }
                return null;
            };
            assemblyResolverRegistered = true;
        }

        JSObject input;
        try
        {
            if (inputVal.IsObject()) input = (JSObject)inputVal;
            else
            {
                Console.WriteLine("Input is not an object.");
                return JSValue.Null;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("Failed to cast input to JSObject: " + ex);
            return JSValue.Null;
        }

        var inputDict = new Dictionary<string, object>();
        var knownProperties = new[] {
            "title", "url", "html", "width", "height", "min_width", "min_height", "x", "y",
            "resizable", "fullscreen", "hidden", "frameless", "focus",
            "minimized", "maximized", "on_top", "confirm_close",
            "background_color", "transparent", "vibrancy", "dark_mode",
            "title_bar", "initScript", "session", "debug", "additional_args", "icon"
        };

        foreach (var key in knownProperties)
        {
            var jsValue = input[key];
            if (!jsValue.IsUndefined())
            {
                if (jsValue.IsBoolean()) inputDict[key] = (bool)jsValue;
                else if (jsValue.IsNumber()) inputDict[key] = (double)jsValue;
                else if (jsValue.IsString()) inputDict[key] = (string)jsValue;
                else if (key == "session" && jsValue.IsObject())
                {
                    var sessDict = new Dictionary<string, object>();
                    try
                    {
                        var sessObj = (JSObject)jsValue;
                        var p = sessObj["persist"]; if (!p.IsUndefined() && p.IsBoolean()) sessDict["persist"] = (bool)p;
                        var pt = sessObj["path"]; if (!pt.IsUndefined() && pt.IsString()) sessDict["path"] = (string)pt;
                        var e = sessObj["envname"]; if (!e.IsUndefined() && e.IsString()) sessDict["envname"] = (string)e;
                    }
                    catch { }
                    inputDict[key] = sessDict;
                }
            }
        }

        JSReference? onMessageRef = null;
        JSThreadSafeFunction? onMessageTsfn = null;
        var onMsgVal = input["onMessage"];
        if (!onMsgVal.IsUndefined() && onMsgVal.IsFunction())
        {
            onMessageRef = new JSReference(onMsgVal);
            onMessageTsfn = new JSThreadSafeFunction(0, 1, (JSValue)"ewvjs_msg", onMsgVal);
        }

        // Create promise for the window API object
        var promise = JSValue.CreatePromise(out var deferred);

        var thread = new Thread(() =>
        {
            try
            {
                var window = new WebViewWindow(inputDict, onMessageRef, onMessageTsfn, deferred);
                Application.Run(window);
            }
            catch (Exception ex)
            {
                if (onMessageTsfn != null)
                {
                    onMessageTsfn.NonBlockingCall(() => deferred.Reject(new JSError(ex.Message)));
                }
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return promise;
    }
}

public class WebViewWindow : Form
{
    private WebView2? webView;
    private IDictionary<string, object> options;
    private JSReference? onMessageRef;
    private JSThreadSafeFunction? onMessageTsfn;
    private volatile bool tsfnValid = false;
    private JSPromise.Deferred onReadyDeferred;
    private string? userDataPath;
    private bool isAnonymous;
    private bool isTitleBarDisabled = false;

    private class FrameInfo
    {
        public CoreWebView2Frame Frame { get; }
        public string Name { get; set; }
        public string Uri { get; set; }

        public FrameInfo(CoreWebView2Frame frame)
        {
            Frame = frame;
            Name = frame.Name ?? "";
            Uri = "";
        }
    }

    private readonly Dictionary<uint, FrameInfo> _frames = new Dictionary<uint, FrameInfo>();

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    [DllImport("dwmapi.dll")]
    private static extern int DwmExtendFrameIntoClientArea(IntPtr hwnd, ref MARGINS margins);

    [DllImport("user32.dll")] public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
    [DllImport("user32.dll")] public static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;

    private const int WM_NCCALCSIZE = 0x83;
    private const int WM_NCHITTEST = 0x0084;
    private const int WM_NCACTIVATE = 0x0086;

    private void UpdateFrame()
    {
        SetWindowPos(this.Handle, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }

    public WebViewWindow(IDictionary<string, object> options, JSReference? onMessageRef, JSThreadSafeFunction? onMessageTsfn, JSPromise.Deferred onReadyDeferred)
    {
        this.options = options;
        this.onMessageRef = onMessageRef;
        this.onMessageTsfn = onMessageTsfn;
        this.tsfnValid = (onMessageTsfn != null);
        this.onReadyDeferred = onReadyDeferred;

        this.Text = options.ContainsKey("title") ? (string)options["title"] : "ewvjs Window";
        int width = options.ContainsKey("width") ? Convert.ToInt32(options["width"]) : 800;
        int height = options.ContainsKey("height") ? Convert.ToInt32(options["height"]) : 600;
        this.Size = new Size(width, height);

        if (options.ContainsKey("min_width") || options.ContainsKey("min_height"))
        {
            int minWidth = options.ContainsKey("min_width") ? Convert.ToInt32(options["min_width"]) : 0;
            int minHeight = options.ContainsKey("min_height") ? Convert.ToInt32(options["min_height"]) : 0;
            this.MinimumSize = new Size(minWidth, minHeight);
        }

        if (options.ContainsKey("title_bar") && !(bool)options["title_bar"])
        {
            Console.WriteLine("Title bar is disabled");
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.isTitleBarDisabled = true;
            this.Padding = this.WindowState == FormWindowState.Maximized ? new Padding(8) : new Padding(0);
        }
        else if (options.ContainsKey("frameless") && (bool)options["frameless"]) this.FormBorderStyle = FormBorderStyle.None;
        else if (options.ContainsKey("resizable") && !(bool)options["resizable"])
        {
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
        }

        if (options.ContainsKey("on_top") && (bool)options["on_top"]) this.TopMost = true;

        if (options.ContainsKey("icon") && options["icon"] is string iconPath)
        {
            try
            {
                if (File.Exists(iconPath))
                {
                    this.Icon = new Icon(iconPath);
                }
                else
                {
                    Console.WriteLine($"Warning: Icon file not found: {iconPath}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Warning: Failed to load icon: {ex.Message}");
            }
        }

        if (options.ContainsKey("hidden") && (bool)options["hidden"])
        {
            this.Visible = false;
            this.WindowState = FormWindowState.Minimized;
        }

        if (options.ContainsKey("transparent") && (bool)options["transparent"])
        {
            this.BackColor = Color.Black;
            this.AllowTransparency = true;
            this.TransparencyKey = Color.Black;
        }
        else if (options.ContainsKey("background_color"))
        {
            try { this.BackColor = ColorTranslator.FromHtml((string)options["background_color"]); } catch { }
        }

        this.Load += WebViewWindow_Load;
        this.FormClosing += WebViewWindow_FormClosing;
        this.FormClosed += (s, e) =>
        {
            if (tsfnValid)
            {
                Task.Run(() => SendMessageAsync("[\"closed\", \"\"]")).Wait(100);
                tsfnValid = false;
            }
            if (this.isAnonymous && !string.IsNullOrEmpty(this.userDataPath)) CleanupUserData(this.userDataPath);
            if (this.onMessageRef != null)
            {
                try { this.onMessageRef.Dispose(); } catch { }
                this.onMessageRef = null;
            }
            if (this.onMessageTsfn != null)
            {
                try { this.onMessageTsfn.Release(); } catch { }
                this.onMessageTsfn = null;
            }
        };

        this.Resize += (s, e) =>
        {
            if (tsfnValid)
            {
                string state = "normal";
                if (this.WindowState == FormWindowState.Maximized) state = "maximized";
                else if (this.WindowState == FormWindowState.Minimized) state = "minimized";
                Task.Run(() => SendMessageAsync(new object[] { "resized", new { width = this.Width, height = this.Height, state = state } }));
            }
        };

        this.LocationChanged += (s, e) =>
        {
            if (tsfnValid)
            {
                Task.Run(() => SendMessageAsync(new object[] { "moved", new { x = this.Location.X, y = this.Location.Y } }));
            }
        };

        this.VisibleChanged += (s, e) =>
        {
            if (tsfnValid)
            {
                Task.Run(() => SendMessageAsync(new object[] { "visibility_changed", this.Visible }));
            }
        };

        this.Activated += (s, e) =>
        {
            if (tsfnValid)
            {
                Task.Run(() => SendMessageAsync(new object[] { "focus_changed", true }));
            }
        };

        this.Deactivate += (s, e) =>
        {
            if (tsfnValid)
            {
                Task.Run(() => SendMessageAsync(new object[] { "focus_changed", false }));
            }
        };
    }

    private void CleanupUserData(string path)
    {
        Task.Run(async () =>
        {
            try
            {
                await Task.Delay(5000);
                if (Directory.Exists(path)) Directory.Delete(path, true);
            }
            catch { }
        });
    }

    private void WebViewWindow_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (this.options.ContainsKey("confirm_close") && (bool)this.options["confirm_close"])
        {
            var result = MessageBox.Show("Are you sure you want to close?", "Confirm Close", MessageBoxButtons.YesNo);
            if (result == DialogResult.No) e.Cancel = true;
        }
    }

    private T GetProp<T>(object input, string key, T def)
    {
        try
        {
            if (input is IDictionary<string, object> d && d.ContainsKey(key))
                return (T)Convert.ChangeType(d[key], typeof(T));

            if (input is JSObject j)
            {
                var val = j[key];
                if (!val.IsUndefined())
                {
                    if (typeof(T) == typeof(int)) return (T)(object)(int)val;
                    if (typeof(T) == typeof(double)) return (T)(object)(double)val;
                    if (typeof(T) == typeof(bool)) return (T)(object)(bool)val;
                    if (typeof(T) == typeof(string)) return (T)(object)(string)val;
                }
            }
        }
        catch { }
        return def;
    }

    private int GetInt(object i, string key)
    {
        try
        {
            if (i is JSObject j) return (int)j[key];
            if (i is IDictionary<string, object> d) return Convert.ToInt32(d[key]);
        }
        catch { }
        return 0;
    }

    private Task<T> RunOnUI<T>(Func<Task<T>> func)
    {
        var tcs = new TaskCompletionSource<T>();
        this.Invoke(new Action(async () =>
        {
            try
            {
                var res = await func();
                tcs.SetResult(res);
            }
            catch (Exception ex) { tcs.SetException(ex); }
        }));
        return tcs.Task;
    }

    private Task RunOnUI(Func<Task> func)
    {
        var tcs = new TaskCompletionSource<object?>();
        this.Invoke(new Action(async () =>
        {
            try
            {
                await func();
                tcs.SetResult(null);
            }
            catch (Exception ex) { tcs.SetException(ex); }
        }));
        return tcs.Task;
    }

    private async void WebViewWindow_Load(object? sender, EventArgs e)
    {
        try
        {
            SystemEvents.UserPreferenceChanged += SystemEvents_UserPreferenceChanged;
            this.FormClosed += (s, ev) => SystemEvents.UserPreferenceChanged -= SystemEvents_UserPreferenceChanged;

            if (options.ContainsKey("title_bar") && !(bool)options["title_bar"])
            {
                this.ControlBox = false;
                ApplyVibrancy();
                // this.Text = String.Empty;
                UpdateTheme();
            }

            bool hasIcon = options.ContainsKey("icon");
            this.ShowIcon = hasIcon;

            ApplyVibrancy();
            UpdateTheme();
            await InitializeWebView();
            UpdateTheme();
            ApplyVibrancy();

            if (options.ContainsKey("show") && (bool)options["show"])
            {
                this.Show();
                this.Activate();
                if (this.webView != null) this.webView.Focus();
            }
            else if (options.ContainsKey("hidden") && (bool)options["hidden"])
            {
                this.Hide();
            }
            else
            {
                this.Show();
            }

            // Create API object on JS thread using thread-safe function
            if (tsfnValid && onMessageTsfn != null && onMessageRef != null)
            {
                onMessageTsfn.NonBlockingCall(() =>
                {
                    try
                    {
                        var c = JSValue.CreateObject();

                        c["evaluate"] = JSValue.CreateFunction("evaluate", new JSCallback((args) =>
                        {
                            string script = "";
                            object? frameSelector = null;
                            if (args.Length > 0)
                            {
                                var arg0 = args[0];
                                if (arg0.IsObject() && !arg0.IsFunction())
                                {
                                    try
                                    {
                                        var obj = (JSObject)arg0;
                                        var sVal = obj["script"];
                                        if (!sVal.IsUndefined())
                                        {
                                            script = sVal.IsString() ? (string)sVal : sVal.ToString() ?? "";
                                        }
                                        var fVal = obj["frame"];
                                        if (!fVal.IsUndefined())
                                        {
                                            if (fVal.IsNumber()) frameSelector = (double)fVal;
                                            else if (fVal.IsString()) frameSelector = (string)fVal;
                                        }
                                    }
                                    catch
                                    {
                                        script = arg0.ToString() ?? "";
                                    }
                                }
                                else
                                {
                                    script = arg0.IsString() ? (string)arg0 : arg0.ToString() ?? "";
                                    if (args.Length > 1)
                                    {
                                        var arg1 = args[1];
                                        if (arg1.IsNumber()) frameSelector = (double)arg1;
                                        else if (arg1.IsString()) frameSelector = (string)arg1;
                                    }
                                }
                            }

                            var promise = JSValue.CreatePromise(out var deferred);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(async () =>
                                {
                                    try
                                    {
                                        string? result = null;
                                        bool frameFoundOrNotTargeted = true;
                                        string errorMsg = "";

                                        await RunOnUI(async () =>
                                        {
                                            if (this.webView == null)
                                            {
                                                errorMsg = "WebView is not initialized.";
                                                frameFoundOrNotTargeted = false;
                                                return;
                                            }

                                            if (frameSelector != null)
                                            {
                                                CoreWebView2Frame? targetFrame = null;
                                                lock (_frames)
                                                {
                                                    if (frameSelector is double dId)
                                                    {
                                                        uint id = (uint)dId;
                                                        if (_frames.ContainsKey(id))
                                                        {
                                                            targetFrame = _frames[id].Frame;
                                                        }
                                                    }
                                                    else if (frameSelector is string selectorStr)
                                                    {
                                                        if (uint.TryParse(selectorStr, out uint id) && _frames.ContainsKey(id))
                                                        {
                                                            targetFrame = _frames[id].Frame;
                                                        }
                                                        else
                                                        {
                                                            var match = _frames.Values.FirstOrDefault(f =>
                                                                string.Equals(f.Name, selectorStr, StringComparison.OrdinalIgnoreCase));
                                                            if (match != null)
                                                            {
                                                                targetFrame = match.Frame;
                                                            }
                                                            else
                                                            {
                                                                var matchUri = _frames.Values.FirstOrDefault(f =>
                                                                    f.Uri != null && f.Uri.IndexOf(selectorStr, StringComparison.OrdinalIgnoreCase) >= 0);
                                                                if (matchUri != null)
                                                                {
                                                                    targetFrame = matchUri.Frame;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }

                                                if (targetFrame != null)
                                                {
                                                    result = await targetFrame.ExecuteScriptAsync(script);
                                                }
                                                else
                                                {
                                                    errorMsg = $"Frame not found for selector: {frameSelector}";
                                                    frameFoundOrNotTargeted = false;
                                                }
                                            }
                                            else
                                            {
                                                result = await this.webView.ExecuteScriptAsync(script);
                                            }
                                        });

                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            if (frameFoundOrNotTargeted)
                                            {
                                                JSValue jsResult = result != null ? (JSValue)result : JSValue.Null;
                                                deferred.Resolve(jsResult);
                                            }
                                            else
                                            {
                                                deferred.Reject(new JSError(errorMsg));
                                            }
                                        });
                                    }
                                    catch (Exception ex)
                                    {
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            deferred.Reject(new JSError(ex.Message));
                                        });
                                    }
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));



                        c["close"] = JSValue.CreateFunction("close", new JSCallback((args) =>
                        {
                            this.Invoke(new Action(() => this.Close()));
                            return JSValue.Undefined;
                        }));

                        c["setTitle"] = JSValue.CreateFunction("setTitle", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            var title = input.IsString() ? (string)input : input.ToString() ?? "";
                            this.Invoke(new Action(() =>
                            {
                                options["title"] = title;
                                if (!(this.options.ContainsKey("title_bar") && !(bool)this.options["title_bar"]))
                                {
                                    this.Text = title;
                                }
                            }));
                            return JSValue.Undefined;
                        }));

                        c["setTitleBar"] = JSValue.CreateFunction("setTitleBar", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            bool visible = input.IsBoolean() && (bool)input;
                            this.Invoke(new Action(() =>
                            {
                                this.isTitleBarDisabled = !visible;
                                this.ControlBox = visible;
                                bool hasIcon = options.ContainsKey("icon");
                                this.ShowIcon = visible && hasIcon;
                                // this.Text = !visible ? String.Empty : (options.ContainsKey("title") ? (string)options["title"] : "ewvjs Window");
                                this.Padding = (this.isTitleBarDisabled && this.WindowState == FormWindowState.Maximized) ? new Padding(8) : new Padding(0);
                                this.UpdateFrame();
                                UpdateTheme();
                                ApplyVibrancy();
                                if (this.webView?.CoreWebView2 != null)
                                {
                                    try { this.webView.CoreWebView2.ExecuteScriptAsync($"window.__isTitleBarDisabled = {(this.isTitleBarDisabled ? "true" : "false")};"); } catch { }
                                }
                            }));
                            return JSValue.Undefined;
                        }));

                        c["setIcon"] = JSValue.CreateFunction("setIcon", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            var iconPath = input.IsString() ? (string)input : input.ToString();
                            this.Invoke(new Action(() =>
                            {
                                try
                                {
                                    if (File.Exists(iconPath))
                                    {
                                        this.Icon = new Icon(iconPath);
                                        options["icon"] = iconPath;
                                    }
                                    else
                                    {
                                        Console.WriteLine($"Warning: Icon file not found: {iconPath}");
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine($"Warning: Failed to load icon: {ex.Message}");
                                }
                            }));
                            return JSValue.Undefined;
                        }));

                        c["setSize"] = JSValue.CreateFunction("setSize", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            int w = 800, h = 600;
                            if (input.IsObject())
                            {
                                var obj = (JSObject)input;
                                var wVal = obj["width"]; if (!wVal.IsUndefined()) w = (int)wVal;
                                var hVal = obj["height"]; if (!hVal.IsUndefined()) h = (int)hVal;
                            }
                            this.Invoke(new Action(() => this.Size = new Size(w, h)));
                            return JSValue.Undefined;
                        }));

                        c["setPosition"] = JSValue.CreateFunction("setPosition", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            int x = 0, y = 0;
                            if (input.IsObject())
                            {
                                var obj = (JSObject)input;
                                var xVal = obj["x"]; if (!xVal.IsUndefined()) x = (int)xVal;
                                var yVal = obj["y"]; if (!yVal.IsUndefined()) y = (int)yVal;
                            }
                            this.Invoke(new Action(() => this.Location = new Point(x, y)));
                            return JSValue.Undefined;
                        }));

                        c["move"] = c["setPosition"];

                        c["getSize"] = JSValue.CreateFunction("getSize", new JSCallback((args) =>
                        {
                            var promise = JSValue.CreatePromise(out var deferred);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(() =>
                                {
                                    int width = 0, height = 0;
                                    this.Invoke(new Action(() =>
                                    {
                                        width = this.Width;
                                        height = this.Height;
                                    }));
                                    onMessageTsfn.NonBlockingCall(() =>
                                    {
                                        var result = JSValue.CreateObject();
                                        result["width"] = width;
                                        result["height"] = height;
                                        deferred.Resolve(result);
                                    });
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));

                        c["getPosition"] = JSValue.CreateFunction("getPosition", new JSCallback((args) =>
                        {
                            var promise = JSValue.CreatePromise(out var deferred);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(() =>
                                {
                                    int x = 0, y = 0;
                                    this.Invoke(new Action(() =>
                                    {
                                        x = this.Location.X;
                                        y = this.Location.Y;
                                    }));
                                    onMessageTsfn.NonBlockingCall(() =>
                                    {
                                        var result = JSValue.CreateObject();
                                        result["x"] = x;
                                        result["y"] = y;
                                        deferred.Resolve(result);
                                    });
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));

                        c["setMinSize"] = JSValue.CreateFunction("setMinSize", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            int w = 0, h = 0;
                            if (input.IsObject())
                            {
                                var obj = (JSObject)input;
                                var wVal = obj["width"]; if (!wVal.IsUndefined()) w = (int)wVal;
                                var hVal = obj["height"]; if (!hVal.IsUndefined()) h = (int)hVal;
                            }
                            this.Invoke(new Action(() => this.MinimumSize = new Size(w, h)));
                            return JSValue.Undefined;
                        }));

                        c["getMinSize"] = JSValue.CreateFunction("getMinSize", new JSCallback((args) =>
                        {
                            var promise = JSValue.CreatePromise(out var deferred);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(() =>
                                {
                                    int width = 0, height = 0;
                                    this.Invoke(new Action(() =>
                                    {
                                        width = this.MinimumSize.Width;
                                        height = this.MinimumSize.Height;
                                    }));
                                    onMessageTsfn.NonBlockingCall(() =>
                                    {
                                        var result = JSValue.CreateObject();
                                        result["width"] = width;
                                        result["height"] = height;
                                        deferred.Resolve(result);
                                    });
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));

                        c["maximize"] = JSValue.CreateFunction("maximize", new JSCallback((args) => { this.Invoke(new Action(() => this.WindowState = FormWindowState.Maximized)); return JSValue.Undefined; }));
                        c["minimize"] = JSValue.CreateFunction("minimize", new JSCallback((args) => { this.Invoke(new Action(() => this.WindowState = FormWindowState.Minimized)); return JSValue.Undefined; }));
                        c["restore"] = JSValue.CreateFunction("restore", new JSCallback((args) => { this.Invoke(new Action(() => this.WindowState = FormWindowState.Normal)); return JSValue.Undefined; }));
                        c["focus"] = JSValue.CreateFunction("focus", new JSCallback((args) => { this.Invoke(new Action(() => this.Activate())); return JSValue.Undefined; }));
                        c["show"] = JSValue.CreateFunction("show", new JSCallback((args) => { this.Invoke(new Action(() => this.Show())); return JSValue.Undefined; }));
                        c["hide"] = JSValue.CreateFunction("hide", new JSCallback((args) => { this.Invoke(new Action(() => this.Hide())); return JSValue.Undefined; }));

                        c["getCookies"] = JSValue.CreateFunction("getCookies", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            var url = input.IsString() ? (string)input : "";
                            var promise = JSValue.CreatePromise(out var deferred);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(async () =>
                                {
                                    try
                                    {
                                        List<Dictionary<string, object>>? cookies = null;
                                        await RunOnUI(async () =>
                                        {
                                            var list = this.webView?.CoreWebView2?.CookieManager != null ? await this.webView.CoreWebView2.CookieManager.GetCookiesAsync(url) : null;
                                            cookies = new List<Dictionary<string, object>>();
                                            if (list != null) foreach (var ck in list)
                                            {
                                                var d = new Dictionary<string, object>();
                                                d["name"] = ck.Name;
                                                d["value"] = ck.Value;
                                                d["domain"] = ck.Domain;
                                                d["path"] = ck.Path;
                                                d["expires"] = ck.Expires;
                                                d["httpOnly"] = ck.IsHttpOnly;
                                                d["secure"] = ck.IsSecure;
                                                cookies.Add(d);
                                            }
                                        });
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            var jsonCookies = System.Text.Json.JsonSerializer.Serialize(cookies);
                                            deferred.Resolve((JSValue)jsonCookies);
                                        });
                                    }
                                    catch (Exception ex)
                                    {
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            deferred.Reject(new JSError(ex.Message));
                                        });
                                    }
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));

                        c["setCookie"] = JSValue.CreateFunction("setCookie", new JSCallback((args) =>
                        {
                            var input = args.Length > 0 ? args[0] : JSValue.Undefined;
                            var promise = JSValue.CreatePromise(out var deferred);
                            string? name = GetProp<string?>(input, "name", null);
                            string? value = GetProp<string?>(input, "value", null);
                            string? domain = GetProp<string?>(input, "domain", null);
                            string? path = GetProp<string?>(input, "path", null);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(async () =>
                                {
                                    try
                                    {
                                        await RunOnUI(async () =>
                                        {
                                            if (name != null && value != null && domain != null && this.webView?.CoreWebView2?.CookieManager != null)
                                            {
                                                var cookie = this.webView.CoreWebView2.CookieManager.CreateCookie(name, value, domain, path ?? "/");
                                                this.webView.CoreWebView2.CookieManager.AddOrUpdateCookie(cookie);
                                            }
                                        });
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            deferred.Resolve(JSValue.Undefined);
                                        });
                                    }
                                    catch (Exception ex)
                                    {
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            deferred.Reject(new JSError(ex.Message));
                                        });
                                    }
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));

                        c["clearCookies"] = JSValue.CreateFunction("clearCookies", new JSCallback((args) =>
                        {
                            var promise = JSValue.CreatePromise(out var deferred);
                            if (onMessageTsfn != null && tsfnValid)
                            {
                                Task.Run(async () =>
                                {
                                    try
                                    {
                                        await RunOnUI(async () => { this.webView?.CoreWebView2?.CookieManager?.DeleteAllCookies(); });
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            deferred.Resolve(JSValue.Undefined);
                                        });
                                    }
                                    catch (Exception ex)
                                    {
                                        onMessageTsfn.NonBlockingCall(() =>
                                        {
                                            deferred.Reject(new JSError(ex.Message));
                                        });
                                    }
                                });
                            }
                            else
                            {
                                deferred.Reject(new JSError("Window not initialized"));
                            }
                            return promise;
                        }));

                        onReadyDeferred.Resolve(c);
                    }
                    catch (Exception ex)
                    {
                        onReadyDeferred.Reject(new JSError("API Creation Error: " + ex.ToString()));
                    }
                });
            }
        }
        catch (Exception ex) { MessageBox.Show("Load Error: " + ex.ToString()); }
    }

    private async Task InitializeWebView()
    {
        try
        {
            this.webView = new WebView2 { Dock = DockStyle.Fill };
            this.Controls.Add(this.webView);

            bool persist = false;
            string? customPath = null;
            string? envName = null;
            if (options.ContainsKey("session") && options["session"] is Dictionary<string, object> sess)
            {
                if (sess.ContainsKey("persist")) persist = (bool)sess["persist"];
                if (sess.ContainsKey("path")) customPath = (string)sess["path"];
                if (sess.ContainsKey("envname")) envName = (string)sess["envname"];
            }

            if (!string.IsNullOrEmpty(customPath)) { userDataPath = customPath; isAnonymous = false; }
            else if (persist)
            {
                userDataPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), envName ?? "ewvjs_webview2");
                isAnonymous = false;
            }
            else
            {
                userDataPath = Path.Combine(Path.GetTempPath(), "ewvjs_" + Guid.NewGuid().ToString());
                isAnonymous = true;
            }

            CoreWebView2EnvironmentOptions envOptions = new CoreWebView2EnvironmentOptions();
            if (this.options.ContainsKey("additional_args")) envOptions.AdditionalBrowserArguments = (string)this.options["additional_args"];

            var environment = await CoreWebView2Environment.CreateAsync(null, userDataPath, envOptions);
            await webView.EnsureCoreWebView2Async(environment);

            webView.CoreWebView2.FrameCreated += (sender, args) =>
            {
                var frame = args.Frame;
                uint frameId = frame.FrameId;
                var info = new FrameInfo(frame);

                lock (_frames)
                {
                    _frames[frameId] = info;
                }

                frame.NameChanged += (s, ev) =>
                {
                    lock (_frames)
                    {
                        if (_frames.ContainsKey(frameId))
                        {
                            _frames[frameId].Name = frame.Name ?? "";
                        }
                    }
                };

                frame.NavigationStarting += (s, ev) =>
                {
                    lock (_frames)
                    {
                        if (_frames.ContainsKey(frameId))
                        {
                            _frames[frameId].Uri = ev.Uri ?? "";
                        }
                    }
                };

                frame.Destroyed += (s, ev) =>
                {
                    lock (_frames)
                    {
                        _frames.Remove(frameId);
                    }
                };
            };

            if ((options.ContainsKey("transparent") && (bool)options["transparent"]) ||
                (!options.ContainsKey("vibrancy") || (bool)options["vibrancy"]))
            {
                this.webView.DefaultBackgroundColor = Color.Transparent;
            }

            await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync($"window.__isTitleBarDisabled = {(isTitleBarDisabled ? "true" : "false")}; window.__isWindowMaximized = {(this.WindowState == FormWindowState.Maximized ? "true" : "false")};");

            if (options.ContainsKey("initScript"))
                await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync((string)options["initScript"]);

            webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
            webView.CoreWebView2.NewWindowRequested += (s, e) => { e.Handled = true; };
            webView.CoreWebView2.DOMContentLoaded += (s, e) =>
            {
                Task.Run(() => SendMessageAsync("[\"dom_ready\", \"\"]"));
            };

            bool debugEnabled = !options.ContainsKey("debug") || (bool)options["debug"];

            webView.CoreWebView2.Settings.AreDevToolsEnabled = debugEnabled;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = debugEnabled;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = debugEnabled;

            webView.CoreWebView2.ContextMenuRequested += CoreWebView2_ContextMenuRequested;

            if (options.ContainsKey("url")) webView.Source = new Uri((string)options["url"]);
            else if (options.ContainsKey("html")) webView.NavigateToString((string)options["html"]);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Failed to initialize WebView2: " + ex.Message);
        }
    }

    private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            // Try to get as string first (for simple messages like "drag"), fallback to JSON for arrays
            string msg;
            try
            {
                msg = e.TryGetWebMessageAsString();
            }
            catch
            {
                msg = e.WebMessageAsJson;
            }
            if (msg == "drag")
            {
                this.Invoke(new Action(() => { ReleaseCapture(); SendMessage(this.Handle, 0xA1, 0x2, 0); }));
            }
            else if (msg != null && msg.StartsWith("resize:"))
            {
                if (this.WindowState != FormWindowState.Maximized)
                {
                    string dir = msg.Substring(7);
                    int dirVal = 0;
                    switch (dir)
                    {
                        case "left": dirVal = 1; break;
                        case "right": dirVal = 2; break;
                        case "top": dirVal = 3; break;
                        case "topleft": dirVal = 4; break;
                        case "topright": dirVal = 5; break;
                        case "bottom": dirVal = 6; break;
                        case "bottomleft": dirVal = 7; break;
                        case "bottomright": dirVal = 8; break;
                    }
                    if (dirVal > 0)
                    {
                        this.Invoke(new Action(() => { ReleaseCapture(); SendMessage(this.Handle, 0x0112, 0xF000 + dirVal, 0); }));
                    }
                }
            }
            else
            {
                await SendMessageAsync(msg);
            }
        }
        catch { }
    }

    private async void CoreWebView2_ContextMenuRequested(object? sender, CoreWebView2ContextMenuRequestedEventArgs args)
    {
        var deferral = args.GetDeferral();
        try
        {
            var menuList = args.MenuItems;
            var defaultItems = SerializeMenuItems(menuList);

            // Add timeout to prevent hanging if JS doesn't respond
            var messageTask = SendMessageAsync(new object[] { "context_menu_requested", defaultItems });
            var timeoutTask = Task.Delay(1000); // 1 second timeout
            var completedTask = await Task.WhenAny(messageTask, timeoutTask);

            string? resultStr = null;
            if (completedTask == messageTask)
            {
                resultStr = await messageTask;
            }

            // Parse custom menu items first
            bool hasCustomMenu = false;
            if (!string.IsNullOrEmpty(resultStr))
            {
                try
                {
                    var jsonDoc = JsonDocument.Parse(resultStr);
                    var items = ConvertJsonElementToStructure(jsonDoc.RootElement);
                    if (items is object[] list && list.Length > 0)
                    {
                        // Clear default items only if we have custom items to show
                        if (!(this.options.ContainsKey("debug") && (bool)this.options["debug"]))
                        {
                            menuList.Clear();
                        }
                        PopulateCustomContextMenu(list, menuList);
                        hasCustomMenu = true;
                    }
                }
                catch { }
            }

            // If no custom menu and not in debug mode, clear to hide default menu
            if (!hasCustomMenu && !(this.options.ContainsKey("debug") && (bool)this.options["debug"]))
            {
                menuList.Clear();
            }
        }
        finally { deferral.Complete(); }
    }

    private object? ConvertJsonElementToStructure(JsonElement el)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Array: return el.EnumerateArray().Select(x => ConvertJsonElementToStructure(x)).ToArray();
            case JsonValueKind.Object:
                var dict = new Dictionary<string, object?>();
                foreach (var prop in el.EnumerateObject()) dict[prop.Name] = ConvertJsonElementToStructure(prop.Value);
                return dict;
            case JsonValueKind.String: return el.GetString();
            case JsonValueKind.Number: return el.GetDouble();
            case JsonValueKind.True: return true;
            case JsonValueKind.False: return false;
            default: return null;
        }
    }

    private List<Dictionary<string, object>> SerializeMenuItems(IList<CoreWebView2ContextMenuItem> items)
    {
        var list = new List<Dictionary<string, object>>();
        foreach (var item in items)
        {
            var d = new Dictionary<string, object>();
            d["label"] = item.Label;
            d["id"] = item.CommandId.ToString();
            d["enabled"] = item.IsEnabled;
            d["checked"] = item.IsChecked;
            d["type"] = item.Kind.ToString().ToLower();
            if (item.Kind == CoreWebView2ContextMenuItemKind.Submenu) d["submenu"] = SerializeMenuItems(item.Children);
            list.Add(d);
        }
        return list;
    }

    private void PopulateCustomContextMenu(object[] menuItems, IList<CoreWebView2ContextMenuItem> menuList)
    {
        if (webView?.CoreWebView2?.Environment == null) return;

        foreach (var itemObj in menuItems)
        {
            if (!(itemObj is Dictionary<string, object> item)) continue;
            string type = item.ContainsKey("type") ? (string)item["type"] : "normal";

            if (type == "separator")
            {
                menuList.Insert(menuList.Count, webView.CoreWebView2.Environment.CreateContextMenuItem("", null, CoreWebView2ContextMenuItemKind.Separator));
                continue;
            }

            var kind = item.ContainsKey("submenu") ? CoreWebView2ContextMenuItemKind.Submenu : CoreWebView2ContextMenuItemKind.Command;
            var newItem = webView.CoreWebView2.Environment.CreateContextMenuItem(item.ContainsKey("label") ? (string)item["label"] : "", null, kind);
            newItem.IsEnabled = !item.ContainsKey("enabled") || (bool)item["enabled"];
            newItem.IsChecked = item.ContainsKey("checked") && (bool)item["checked"];

            if (item.ContainsKey("id"))
            {
                string id = (string)item["id"];
                newItem.CustomItemSelected += (s, e) => Task.Run(() => SendMessageAsync("[\"menu_click\", \"" + id + "\"]"));
            }

            if (item.ContainsKey("submenu"))
            {
                object[]? opts = null;
                if (item["submenu"] is object[]) opts = (object[])item["submenu"];
                else if (item["submenu"] is List<object> l) opts = l.ToArray();
                if (opts != null) PopulateCustomContextMenu(opts, newItem.Children);
            }
            menuList.Insert(menuList.Count, newItem);
        }
    }

    private Task<string?> SendMessageAsync(object msg)
    {
        if (!tsfnValid || onMessageTsfn == null) return Task.FromResult<string?>(null);
        var tcs = new TaskCompletionSource<string?>();
        string jsonMsg = msg is string s ? s : JsonSerializer.Serialize(msg);

        // Call the thread-safe function directly
        onMessageTsfn.NonBlockingCall(() =>
        {
            try
            {
                if (onMessageRef == null)
                {
                    tcs.SetResult(null);
                    return;
                }

                var func = onMessageRef.GetValue();
                if (func.IsUndefined())
                {
                    tcs.SetResult(null);
                    return;
                }

                JSValue jsMsg = jsonMsg;
                var cb = JSValue.CreateFunction("cb", new JSCallback((args) =>
                {
                    var err = args[0];
                    var res = args[1];
                    string? resultStr = null;
                    if (!err.IsNull() && !err.IsUndefined())
                    {
                        resultStr = null;
                    }
                    else if (!res.IsUndefined() && res.IsString())
                    {
                        resultStr = (string)res;
                    }
                    tcs.SetResult(resultStr);
                    return JSValue.Undefined;
                }));
                func.Call(JSValue.Undefined, jsMsg, cb);
            }
            catch (Exception ex)
            {
                tcs.SetException(ex);
            }
        });

        return tcs.Task;
    }

    private bool IsDarkModeEnabled()
    {
        try
        {
            using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"))
            {
                if (key != null)
                {
                    var val = key.GetValue("AppsUseLightTheme");
                    if (val != null) return (int)val == 0;
                }
            }
        }
        catch { }
        return false;
    }

    private void ApplyVibrancy()
    {
        if (this.options.ContainsKey("transparent") && (bool)this.options["transparent"]) return;

        if (!this.options.ContainsKey("vibrancy") || (bool)this.options["vibrancy"])
        {
            this.BackColor = Color.FromArgb(1, 1, 1);
            var margins = new MARGINS { Left = -1, Right = -1, Top = -1, Bottom = -1 };
            DwmExtendFrameIntoClientArea(this.Handle, ref margins);
            int backdropValue = 2; // Acrylic
            DwmSetWindowAttribute(this.Handle, 38, ref backdropValue, sizeof(int));
        }
    }

    private void UpdateTheme()
    {
        bool useDarkMode = options.ContainsKey("dark_mode") ? (bool)options["dark_mode"] : IsDarkModeEnabled();
        int darkModeVal = useDarkMode ? 1 : 0;
        DwmSetWindowAttribute(this.Handle, 20, ref darkModeVal, sizeof(int));
        if (this.webView != null && this.webView.CoreWebView2 != null)
        {
            try { this.webView.CoreWebView2.Profile.PreferredColorScheme = useDarkMode ? CoreWebView2PreferredColorScheme.Dark : CoreWebView2PreferredColorScheme.Light; } catch { }
        }
    }

    private void SystemEvents_UserPreferenceChanged(object sender, UserPreferenceChangedEventArgs e)
    {
        if (e.Category == UserPreferenceCategory.General) this.Invoke(new Action(() => UpdateTheme()));
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        if (this.isTitleBarDisabled)
        {
            this.Padding = this.WindowState == FormWindowState.Maximized ? new Padding(8) : new Padding(0);
        }
        if (this.webView?.CoreWebView2 != null)
        {
            try
            {
                this.webView.CoreWebView2.ExecuteScriptAsync($"window.__isWindowMaximized = {(this.WindowState == FormWindowState.Maximized ? "true" : "false")};");
            }
            catch { }
        }
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WM_NCACTIVATE && this.isTitleBarDisabled)
        {
            if (this.WindowState == FormWindowState.Maximized)
            {
                base.WndProc(ref message);
                return;
            }
            // Set LParam to -1 to prevent DefWindowProc from painting standard borders/captions (suppressing the focus border),
            // while still allowing the OS/DWM to process activation changes so Mica/Acrylic backdrops update active/inactive state properly.
            message.LParam = (IntPtr)(-1);
            base.WndProc(ref message);
            return;
        }

        if (message.Msg == WM_NCCALCSIZE && this.isTitleBarDisabled)
        {
            if (this.WindowState == FormWindowState.Maximized)
            {
                base.WndProc(ref message);
                return;
            }
            message.Result = IntPtr.Zero;
            return;
        }

        if (message.Msg == WM_NCHITTEST && this.isTitleBarDisabled)
        {
            if (this.WindowState == FormWindowState.Maximized)
            {
                base.WndProc(ref message);
                return;
            }

            int x = unchecked((short)(long)message.LParam);
            int y = unchecked((short)((long)message.LParam >> 16));
            Point clientPoint = this.PointToClient(new Point(x, y));

            int resizeBorder = 8; // standard resizing border size

            bool onLeft = clientPoint.X < resizeBorder;
            bool onRight = clientPoint.X > this.ClientSize.Width - resizeBorder;
            bool onTop = clientPoint.Y < resizeBorder;
            bool onBottom = clientPoint.Y > this.ClientSize.Height - resizeBorder;

            if (onTop && onLeft)
            {
                message.Result = (IntPtr)13; // HTTOPLEFT
                return;
            }
            if (onTop && onRight)
            {
                message.Result = (IntPtr)14; // HTTOPRIGHT
                return;
            }
            if (onBottom && onLeft)
            {
                message.Result = (IntPtr)16; // HTBOTTOMLEFT
                return;
            }
            if (onBottom && onRight)
            {
                message.Result = (IntPtr)17; // HTBOTTOMRIGHT
                return;
            }
            if (onTop)
            {
                message.Result = (IntPtr)12; // HTTOP
                return;
            }
            if (onBottom)
            {
                message.Result = (IntPtr)15; // HTBOTTOM
                return;
            }
            if (onLeft)
            {
                message.Result = (IntPtr)10; // HTLEFT
                return;
            }
            if (onRight)
            {
                message.Result = (IntPtr)11; // HTRIGHT
                return;
            }

            message.Result = (IntPtr)1; // HTCLIENT
            return;
        }

        base.WndProc(ref message);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MARGINS { public int Left; public int Right; public int Top; public int Bottom; }
}
