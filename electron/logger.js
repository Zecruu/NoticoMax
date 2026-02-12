const fs = require("fs");
const path = require("path");

let LOG_DIR = null;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function init(userDataPath) {
  LOG_DIR = path.join(userDataPath, "logs");
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (err) {
    // Fallback to temp directory
    LOG_DIR = path.join(require("os").tmpdir(), "noticomax-logs");
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }
}

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
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
  const message = args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ");
  const formatted = formatMessage(level, source, message);

  // Write to file if initialized
  if (LOG_DIR) {
    try {
      const logPath = getLogPath();
      rotateIfNeeded(logPath);
      fs.appendFileSync(logPath, formatted);
    } catch {}
  }

  // Also output to console
  if (level === "ERROR") {
    process.stderr.write(formatted);
  } else {
    process.stdout.write(formatted);
  }
}

module.exports = {
  init,
  info: (source, ...args) => writeLog("INFO", source, ...args),
  warn: (source, ...args) => writeLog("WARN", source, ...args),
  error: (source, ...args) => writeLog("ERROR", source, ...args),
  getLogDir: () => LOG_DIR,
  getLogPath,
};
