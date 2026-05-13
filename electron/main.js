const { app, BrowserWindow, shell, Menu, ipcMain } = require("electron");
const path = require("path");
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
const PROD_URL = "https://app.noticomax.com";

let mainWindow;
// Resolver for an in-flight Apple sign-in started via shell.openExternal.
// Set by the open-apple-signin IPC handler; consumed by handleAppleSignInUrl
// when the noticomax:// protocol callback arrives via second-instance (Win)
// or open-url (mac). Null when no sign-in is pending.
let pendingAppleSignInResolver = null;
let pendingAppleSignInTimeout = null;

// Initialize logger immediately with userData path
logger.init(app.getPath("userData"));

// Register noticomax:// as a custom URL scheme so the post-Apple redirect
// from app.noticomax.com/auth/callback can hand the OAuth code back to this
// app. Must run before app.whenReady().
if (process.defaultApp) {
  // Dev: launched via `electron .` — bind the protocol to this script path so
  // the registration sticks to the dev process, not a stray system electron.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("noticomax", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("noticomax");
}

function settlePendingAppleSignIn(result) {
  if (!pendingAppleSignInResolver) return false;
  const resolver = pendingAppleSignInResolver;
  pendingAppleSignInResolver = null;
  if (pendingAppleSignInTimeout) {
    clearTimeout(pendingAppleSignInTimeout);
    pendingAppleSignInTimeout = null;
  }
  resolver(result);
  return true;
}

function handleAppleSignInUrl(urlString) {
  if (!urlString || !urlString.startsWith("noticomax://auth/callback")) return false;
  logger.info("electron", `Apple sign-in callback received: ${urlString.slice(0, 80)}...`);
  try {
    const u = new URL(urlString);
    const error = u.searchParams.get("error_description") || u.searchParams.get("error");
    if (error) {
      settlePendingAppleSignIn({ success: false, error });
    } else {
      const code = u.searchParams.get("code");
      if (code) {
        settlePendingAppleSignIn({ success: true, code });
      } else {
        settlePendingAppleSignIn({ success: false, error: "No code in callback URL" });
      }
    }
  } catch (err) {
    settlePendingAppleSignIn({ success: false, error: err.message });
  }
  // Bring the app window back to the front so the user lands on the post-
  // login screen instead of staring at their browser.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  return true;
}

// Prevent multiple instances. The protocol-launched second instance is what
// delivers the noticomax://auth/callback URL on Windows — we parse its argv.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.info("electron", "Another instance is already running. Quitting.");
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    logger.info("electron", "Second instance detected.");
    const protocolUrl = argv.find((a) => typeof a === "string" && a.startsWith("noticomax://"));
    if (protocolUrl) {
      handleAppleSignInUrl(protocolUrl);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS delivers protocol URLs via open-url instead of argv.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleAppleSignInUrl(url);
});

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

// Apple Sign-In on desktop. Embedding the Apple authorize page inside an
// Electron BrowserWindow trips Apple's anti-webview detection on Windows —
// the user lands on a "URL restricted / no permission" page. So we open the
// Supabase OAuth URL in the user's default browser via shell.openExternal,
// and bring the result back through the noticomax://auth/callback custom
// protocol. The renderer holds the PKCE verifier (it ran signInWithOAuth
// against app.noticomax.com before invoking this IPC), so when we hand the
// code back the same renderer can call supabase.auth.exchangeCodeForSession.
ipcMain.handle("open-apple-signin", async (_event, authUrl) => {
  if (!authUrl || typeof authUrl !== "string") {
    return { success: false, error: "Missing OAuth URL" };
  }

  // If a previous attempt is still pending (user clicked Sign in twice),
  // cancel it before starting a new one.
  settlePendingAppleSignIn({ success: false, error: "Sign-in cancelled" });

  return new Promise((resolve) => {
    pendingAppleSignInResolver = resolve;

    pendingAppleSignInTimeout = setTimeout(() => {
      settlePendingAppleSignIn({ success: false, error: "Sign-in timed out" });
    }, 5 * 60 * 1000);

    shell.openExternal(authUrl).catch((err) => {
      logger.error("electron", `Failed to open browser for Apple sign-in: ${err.message}`);
      settlePendingAppleSignIn({ success: false, error: `Failed to open browser: ${err.message}` });
    });
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
    app.relaunch();
    setTimeout(() => app.exit(0), 500);
    return { success: true };
  } catch (err) {
    logger.error("electron", `wipe-local-data failed: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// --- App Startup ---

app.whenReady().then(() => {
  const url = isDev ? DEV_URL : PROD_URL;
  logger.info("electron", `${isDev ? "Dev" : "Prod"} mode - loading ${url}`);
  createWindow(url);
});

app.on("window-all-closed", () => {
  logger.info("electron", "All windows closed.");
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(isDev ? DEV_URL : PROD_URL);
  }
});

app.on("before-quit", () => {
  logger.info("electron", "App quitting.");
});
