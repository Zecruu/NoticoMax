const { app, BrowserWindow, shell, Menu, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const logger = require("./logger");
const { autoUpdater } = require("electron-updater");

// Auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;
autoUpdater.logger = {
  info: (...args) => logger.info("updater", args.join(" ")),
  warn: (...args) => logger.warn("updater", args.join(" ")),
  error: (...args) => logger.error("updater", args.join(" ")),
  debug: (...args) => logger.info("updater", "[debug] " + args.join(" ")),
};

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5467";
const PROD_PORT = 3099;

// Embedded app configuration (packed inside app.asar, not a plaintext file)
// Replace placeholder values with real ones before building the installer
const APP_ENV = {
  MONGODB_URI: "placeholder",
  ADMIN_SECRET: "placeholder",
  APPLE_TEAM_ID: "placeholder",
  APPLE_KEY_ID: "placeholder",
  APPLE_CLIENT_ID: "placeholder",
  APPLE_BUNDLE_ID: "placeholder",
  APPLE_REDIRECT_URI: "placeholder",
  APPLE_PRIVATE_KEY_BASE64: "placeholder",
  NEXT_PUBLIC_SUPABASE_URL: "placeholder",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "placeholder",
  SUPABASE_SECRET_KEY: "placeholder",
  NEXT_PUBLIC_APP_URL: `http://localhost:${PROD_PORT}`,
};

let mainWindow;
let serverProcess;

// Initialize logger immediately with userData path
logger.init(app.getPath("userData"));

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.info("electron", "Another instance is already running. Quitting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    logger.info("electron", "Second instance detected, focusing existing window.");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Build app menu with Help > Open Logs Folder
const menuTemplate = [
  {
    label: "File",
    submenu: [
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "Help",
    submenu: [
      {
        label: "Open Logs Folder",
        click: () => {
          const logDir = logger.getLogDir();
          if (logDir) {
            shell.openPath(logDir);
          }
        },
      },
    ],
  },
];
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

logger.info("electron", "=== NOTICO MAX STARTING ===");
logger.info("electron", `Version: ${require("../package.json").version}`);
logger.info("electron", `Mode: ${isDev ? "development" : "production"}`);
logger.info("electron", `Platform: ${process.platform} ${process.arch}`);
logger.info("electron", `Electron: ${process.versions.electron}`);
logger.info("electron", `User data: ${app.getPath("userData")}`);
logger.info("electron", `Log directory: ${logger.getLogDir()}`);

function createWindow(url) {
  logger.info("electron", `Creating window with URL: ${url}`);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: "NOTICO MAX",
    icon: isDev
      ? path.join(__dirname, "..", "public", "logo.png")
      : path.join(process.resourcesPath, "standalone", "public", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: false,
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.on("did-finish-load", () => {
    logger.info("electron", "Window finished loading.");
  });

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    logger.error("electron", `Window failed to load: ${errorCode} ${errorDescription}`);
    // Retry loading after a short delay — the server may still be warming up
    if (!isDev) {
      logger.info("electron", "Retrying page load in 2 seconds...");
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(url);
        }
      }, 2000);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function findServerJs() {
  const standaloneDir = path.join(process.resourcesPath, "standalone");

  const directPath = path.join(standaloneDir, "server.js");
  if (fs.existsSync(directPath)) {
    return { serverPath: directPath, cwd: standaloneDir };
  }

  function findFile(dir, filename, depth = 0) {
    if (depth > 4) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name === filename) return dir;
        if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
          const found = findFile(path.join(dir, entry.name), filename, depth + 1);
          if (found) return found;
        }
      }
    } catch {}
    return null;
  }

  const serverDir = findFile(standaloneDir, "server.js");
  if (serverDir) {
    return { serverPath: path.join(serverDir, "server.js"), cwd: serverDir };
  }

  logger.error("electron", `server.js not found in ${standaloneDir}`);
  return { serverPath: directPath, cwd: standaloneDir };
}

function waitForServer(url, maxAttempts = 30, interval = 500) {
  const http = require("http");
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
        logger.info("server", `Server responded with status ${res.statusCode} on attempt ${attempts}`);
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (attempts >= maxAttempts) {
          logger.error("server", `Server not reachable after ${attempts} attempts`);
          reject(new Error("Server failed to start in time"));
        } else {
          setTimeout(check, interval);
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error("Server failed to start in time"));
        } else {
          setTimeout(check, interval);
        }
      });
    };
    check();
  });
}

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const { serverPath, cwd } = findServerJs();

    // Write a DNS fix script that runs before the server starts.
    // mongodb+srv:// needs DNS SRV lookups, which fail with ECONNREFUSED on
    // many ISP/corporate DNS resolvers. Replace the resolver list entirely
    // with public DNS (Google + Cloudflare) so SRV queries always succeed.
    // Also force ipv4-first to avoid IPv6 hangs on some networks.
    const dnsFixPath = path.join(cwd, "_dns-fix.js");
    fs.writeFileSync(
      dnsFixPath,
      'try{const d=require("dns");d.setServers(["8.8.8.8","1.1.1.1","8.8.4.4","1.0.0.1"]);if(typeof d.setDefaultResultOrder==="function"){d.setDefaultResultOrder("ipv4first")}}catch(e){}'
    );

    logger.info("server", `Starting Next.js server: ${serverPath}`);
    logger.info("server", `Working directory: ${cwd}`);
    logger.info("server", `Env keys: ${Object.keys(APP_ENV).join(", ")}`);

    serverProcess = spawn(process.execPath, ["--require", dnsFixPath, serverPath], {
      env: {
        ...process.env,
        ...APP_ENV,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(PROD_PORT),
        HOSTNAME: "localhost",
        NODE_ENV: "production",
      },
      cwd: cwd,
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString().trim();
      if (output) logger.info("server", output);
    });

    serverProcess.stderr.on("data", (data) => {
      const output = data.toString().trim();
      if (output) logger.error("server", output);
    });

    serverProcess.on("error", (err) => {
      logger.error("server", `Failed to start: ${err.message}`);
      reject(err);
    });

    serverProcess.on("exit", (code, signal) => {
      logger.warn("server", `Process exited with code ${code}, signal ${signal}`);
    });

    const url = `http://localhost:${PROD_PORT}`;
    // Poll the server with HTTP requests until it actually responds
    waitForServer(url)
      .then(() => {
        logger.info("server", `Server confirmed ready on port ${PROD_PORT}`);
        resolve(url);
      })
      .catch(reject);
  });
}

// --- IPC Handlers ---

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("check-for-update", async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      const currentVersion = app.getVersion();
      const latestVersion = result.updateInfo.version;
      const hasUpdate = latestVersion !== currentVersion;
      return { hasUpdate, currentVersion, latestVersion };
    }
    return { hasUpdate: false, currentVersion: app.getVersion() };
  } catch (err) {
    logger.error("updater", `Update check failed: ${err.message}`);
    return { hasUpdate: false, error: err.message };
  }
});

ipcMain.handle("download-update", async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    logger.error("updater", `Download failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

// Forward auto-updater events to renderer
autoUpdater.on("download-progress", (progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  }
});

autoUpdater.on("update-downloaded", (info) => {
  logger.info("updater", `Update downloaded: ${info.version}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-downloaded", { version: info.version });
  }
});

autoUpdater.on("error", (err) => {
  logger.error("updater", `Auto-updater error: ${err.message}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update-error", { message: err.message });
  }
});

ipcMain.handle("get-open-at-login", () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("set-open-at-login", (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  logger.info("electron", `Open at login set to: ${enabled}`);
  return enabled;
});

// Apple Sign-In config for Electron (Mac) flow.
// Client ID is the Services ID (not the bundle ID).
const APPLE_CLIENT_ID = "com.noticomax.signin";
const APPLE_REDIRECT_URI = "https://app.noticomax.com/api/auth/apple/callback";

ipcMain.handle("open-apple-signin", async () => {
  const crypto = require("crypto");
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: APPLE_CLIENT_ID,
    redirect_uri: APPLE_REDIRECT_URI,
    response_type: "code",
    scope: "name email",
    state,
    // Apple rejects the auth request with `invalid_request` unless
    // `response_mode=form_post` is used whenever the `name` or `email`
    // scopes are requested. The server callback at APPLE_REDIRECT_URI
    // renders an HTML page that exposes `code` / `error` via the
    // `#code` element's data attributes, which we extract below.
    response_mode: "form_post",
  });
  const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;

  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow ?? undefined,
      modal: true,
      show: true,
      title: "Sign in with Apple",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!authWindow.isDestroyed()) authWindow.close();
      resolve(result);
    };

    authWindow.webContents.on("did-finish-load", async () => {
      const currentUrl = authWindow.webContents.getURL();
      if (!currentUrl.startsWith(APPLE_REDIRECT_URI)) return;
      try {
        const result = await authWindow.webContents.executeJavaScript(`
          (() => {
            const el = document.getElementById('code');
            if (!el) return null;
            return { code: el.dataset.code || null, error: el.dataset.error || null };
          })()
        `);
        if (!result) {
          finish({ success: false, error: "Completion page did not render expected markup" });
          return;
        }
        if (result.error) {
          finish({ success: false, error: result.error });
          return;
        }
        if (result.code) {
          finish({ success: true, code: result.code });
          return;
        }
        finish({ success: false, error: "No code in completion page" });
      } catch (err) {
        finish({ success: false, error: err.message });
      }
    });

    authWindow.on("closed", () => {
      if (!settled) {
        settled = true;
        resolve({ success: false, error: "Window closed" });
      }
    });

    authWindow.loadURL(authUrl);
  });
});

ipcMain.handle("wipe-local-data", async () => {
  // Wipe IndexedDB, localStorage, cookies, cache — everything in the user's session.
  // Used by the "Wipe Local Data" button on macOS where uninstall doesn't auto-clear.
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win) {
      logger.warn("electron", "wipe-local-data: no window available");
      return { success: false, error: "No window available" };
    }
    await win.webContents.session.clearStorageData({
      storages: [
        "appcache",
        "cookies",
        "filesystem",
        "indexdb",
        "localstorage",
        "shadercache",
        "websql",
        "serviceworkers",
        "cachestorage",
      ],
    });
    await win.webContents.session.clearCache();
    logger.info("electron", "Local data wiped");
    // Schedule a relaunch so the renderer starts from a clean slate
    app.relaunch();
    setTimeout(() => app.exit(0), 500);
    return { success: true };
  } catch (err) {
    logger.error("electron", `wipe-local-data failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// --- App Startup ---

app.whenReady().then(async () => {
  if (isDev) {
    logger.info("electron", "Dev mode - connecting to dev server.");
    createWindow(DEV_URL);
  } else {
    try {
      const url = await startProductionServer();
      createWindow(url);
    } catch (err) {
      logger.error("electron", `Fatal error starting server: ${err.message}`);
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  logger.info("electron", "All windows closed.");
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && isDev) {
    createWindow(DEV_URL);
  }
});

app.on("before-quit", () => {
  logger.info("electron", "App quitting.");
  if (serverProcess) serverProcess.kill();
});
