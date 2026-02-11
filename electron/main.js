const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

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
    icon: path.join(__dirname, "..", "public", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Clean frameless look on Windows
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(url);

  // Open external links in the default browser
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

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "..", ".next", "standalone", "server.js");

    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(PROD_PORT),
        HOSTNAME: "localhost",
      },
      cwd: path.join(__dirname, ".."),
      stdio: "pipe",
    });

    serverProcess.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("[server]", output);
      if (output.includes("Ready") || output.includes("started")) {
        resolve(`http://localhost:${PROD_PORT}`);
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error("[server]", data.toString());
    });

    serverProcess.on("error", reject);

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
    const url = await startProductionServer();
    createWindow(url);
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
