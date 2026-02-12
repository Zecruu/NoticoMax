const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = "http://localhost:5467";
const PROD_PORT = 3099;

let mainWindow;
let serverProcess;

function createWindow(url) {
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

  // Direct path (when turbopack root is set correctly)
  const directPath = path.join(standaloneDir, "server.js");
  if (fs.existsSync(directPath)) {
    return { serverPath: directPath, cwd: standaloneDir };
  }

  // Nested path (when Next.js infers wrong workspace root)
  // Look for server.js recursively in subdirectories
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

  return { serverPath: directPath, cwd: standaloneDir };
}

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const { serverPath, cwd } = findServerJs();

    console.log("[electron] Starting server:", serverPath);
    console.log("[electron] CWD:", cwd);

    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(PROD_PORT),
        HOSTNAME: "localhost",
        NODE_ENV: "production",
      },
      cwd: cwd,
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("[server]", output);
      if (output.includes("Ready") || output.includes("started") || output.includes("listening")) {
        resolve(`http://localhost:${PROD_PORT}`);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error("[server]", data.toString());
    });

    serverProcess.on("error", (err) => {
      console.error("[electron] Failed to start server:", err);
      reject(err);
    });

    // Fallback: if no "Ready" message, try after a delay
    setTimeout(() => {
      resolve(`http://localhost:${PROD_PORT}`);
    }, 5000);
  });
}

app.whenReady().then(async () => {
  if (isDev) {
    createWindow(DEV_URL);
  } else {
    try {
      const url = await startProductionServer();
      createWindow(url);
    } catch (err) {
      console.error("[electron] Fatal error starting server:", err);
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
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
  if (serverProcess) {
    serverProcess.kill();
  }
});
