const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const logger = require("./logger");

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5467";
const PROD_PORT = 3099;

let mainWindow;
let serverProcess;

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

logger.info("electron", `NOTICO MAX starting (v${require("../package.json").version})`);
logger.info("electron", `Mode: ${isDev ? "development" : "production"}`);
logger.info("electron", `Platform: ${process.platform} ${process.arch}`);
logger.info("electron", `Electron: ${process.versions.electron}`);
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
    autoHideMenuBar: true,
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

  // Fallback: search for server.js in subdirectories
  function findFile(dir, filename, depth = 0) {
    if (depth > 4) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name === filename) {
          return dir;
        }
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

function loadEnvFile(envPath) {
  const env = {};
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim();
          env[key] = value;
        }
      }
      logger.info("electron", `Loaded env file: ${envPath} (${Object.keys(env).length} vars)`);
    } else {
      logger.warn("electron", `No env file found at: ${envPath}`);
    }
  } catch (err) {
    logger.error("electron", `Failed to load env file: ${err.message}`);
  }
  return env;
}

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const { serverPath, cwd } = findServerJs();

    logger.info("server", `Starting Next.js server: ${serverPath}`);
    logger.info("server", `Working directory: ${cwd}`);

    // Load .env from the standalone resources
    const envVars = loadEnvFile(path.join(cwd, ".env"));

    // ELECTRON_RUN_AS_NODE=1 makes the Electron binary behave as plain Node.js
    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        ...envVars,
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
      logger.info("server", output);
      if (output.includes("Ready") || output.includes("started") || output.includes("listening")) {
        logger.info("server", `Server is ready on port ${PROD_PORT}`);
        resolve(`http://localhost:${PROD_PORT}`);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      logger.error("server", data.toString().trim());
    });

    serverProcess.on("error", (err) => {
      logger.error("server", `Failed to start: ${err.message}`);
      reject(err);
    });

    serverProcess.on("exit", (code, signal) => {
      logger.warn("server", `Process exited with code ${code}, signal ${signal}`);
    });

    // Fallback: if no "Ready" message, try after a delay
    setTimeout(() => {
      logger.warn("server", "No ready signal received, proceeding after timeout.");
      resolve(`http://localhost:${PROD_PORT}`);
    }, 5000);
  });
}

app.whenReady().then(async () => {
  if (isDev) {
    logger.info("electron", "Dev mode — connecting to dev server.");
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
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (isDev) {
      createWindow(DEV_URL);
    }
  }
});

app.on("before-quit", () => {
  logger.info("electron", "App quitting.");
  if (serverProcess) {
    serverProcess.kill();
  }
});
