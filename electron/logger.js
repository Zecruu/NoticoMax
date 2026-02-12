const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const LOG_DIR = path.join(app.getPath("userData"), "logs");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `noticomax-${date}.log`);
}

function rotateIfNeeded(logPath) {
  try {
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > MAX_LOG_SIZE) {
        const rotated = logPath.replace(".log", `-${Date.now()}.old.log`);
        fs.renameSync(logPath, rotated);
      }
    }
  } catch {}
}

function formatMessage(level, source, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${source}] ${message}\n`;
}

function writeLog(level, source, ...args) {
  const message = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const logPath = getLogPath();

  rotateIfNeeded(logPath);

  try {
    fs.appendFileSync(logPath, formatMessage(level, source, message));
  } catch {}

  // Also output to console for dev
  if (level === "ERROR") {
    process.stderr.write(formatMessage(level, source, message));
  } else {
    process.stdout.write(formatMessage(level, source, message));
  }
}

const logger = {
  info: (source, ...args) => writeLog("INFO", source, ...args),
  warn: (source, ...args) => writeLog("WARN", source, ...args),
  error: (source, ...args) => writeLog("ERROR", source, ...args),
  getLogDir: () => LOG_DIR,
  getLogPath,
};

module.exports = logger;
