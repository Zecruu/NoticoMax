const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const logger = require("./logger");

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5467";
const PROD_PORT = 3099;

// Embedded app configuration (packed inside app.asar, not a plaintext file)
// Replace placeholder values with real ones before building the installer
const APP_ENV = {
  MONGODB_URI: "REPLACE_WITH_YOUR_MONGODB_URI",
  AUTH_SECRET: "REPLACE_WITH_YOUR_AUTH_SECRET",
  AUTH_TRUST_HOST: "true",
  AUTH_GOOGLE_ID: "placeholder",
  AUTH_GOOGLE_SECRET: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
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

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const { serverPath, cwd } = findServerJs();

    logger.info("server", `Starting Next.js server: ${serverPath}`);
    logger.info("server", `Working directory: ${cwd}`);
    logger.info("server", `Env keys: ${Object.keys(APP_ENV).join(", ")}`);

    serverProcess = spawn(process.execPath, [serverPath], {
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
      if (output.includes("Ready") || output.includes("started") || output.includes("listening")) {
        logger.info("server", `Server is ready on port ${PROD_PORT}`);
        resolve(`http://localhost:${PROD_PORT}`);
      }
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

    setTimeout(() => {
      logger.warn("server", "No ready signal received, proceeding after timeout.");
      resolve(`http://localhost:${PROD_PORT}`);
    }, 5000);
  });
}

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
