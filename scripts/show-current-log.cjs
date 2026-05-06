const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function pad(value) {
  return String(value).padStart(2, "0");
}

function getTodayLogName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  return `login-worker-${yyyy}-${mm}-${dd}.log`;
}

function tailText(text, lineCount) {
  const lines = String(text).split(/\r?\n/);
  return lines.slice(-lineCount).join("\n");
}

function listRecentLogs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => {
        const fullPath = path.join(dir, entry.name);
        const stat = fs.statSync(fullPath);
        return { name: entry.name, fullPath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 5);
  } catch {
    return [];
  }
}

const logDir = path.resolve(process.cwd(), process.env.LOG_DIR || "data/logs");
const fileName = getTodayLogName();
const filePath = path.join(logDir, fileName);
const tailLines = Number(process.env.LOG_TAIL_LINES || 120);

console.log(`[log-file] ${filePath}`);

if (!fs.existsSync(filePath)) {
  console.log("[log-file] Today's log file does not exist yet.");
  const recentLogs = listRecentLogs(logDir);

  if (recentLogs.length > 0) {
    console.log("[log-file] Recent log files:");
    for (const log of recentLogs) {
      console.log(`- ${log.fullPath}`);
    }
  }

  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf8");
console.log(`[log-file] Showing last ${tailLines} lines`);
console.log(tailText(content, tailLines));
