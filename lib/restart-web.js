import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { envForDetachedSpawn } from "./core.js";
import {
  cmdlineOf,
  dshHomeDir,
  killPid,
  listenerPids,
  looksLikeDshWeb,
  writeRecord,
} from "./web-reclaim.js";

const encoded = process.env.DSH_PURGE_RESTART;
if (!encoded) process.exit(1);

let info;
try {
  info = JSON.parse(encoded);
} catch {
  process.exit(1);
}

const port = Number(info.port) || 3080;
const host = typeof info.host === "string" && info.host ? info.host : "127.0.0.1";

function portFree() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(true));
  });
}

/**
 * 杀掉「发起重启的那个进程」；再按端口兜底一次，清掉旧版本留下、没有 pid 记录的孤儿
 * （#197：只按 info.pid 杀时，上一轮 detached 起来的 server 永远没人管）。
 */
function killOldServer() {
  const pid = Number(info.pid);
  if (pid && pid !== process.pid) killPid(pid);
  for (const other of listenerPids(port)) {
    if (other === process.pid || other === pid) continue;
    if (!looksLikeDshWeb(cmdlineOf(other))) continue;
    killPid(other);
  }
}

function openBrowser(url) {
  if (!url) return;
  if (process.platform === "win32") {
    /* cmd 的 start 会把 & 当命令分隔符：整条命令必须带引号，否则 ?a=1&b=2 的地址只打开前半截。 */
    spawn("cmd.exe", ["/d", "/s", "/c", `start "" "${String(url).replace(/"/g, "")}"`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [url], { detached: true, stdio: "ignore" }).unref();
}

async function waitFree() {
  for (let i = 0; i < 40; i++) {
    if (await portFree()) return true;
    if (i === 8) killOldServer();
    await new Promise((r) => setTimeout(r, 120));
  }
  killOldServer();
  for (let i = 0; i < 40; i++) {
    if (await portFree()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

const ok = await waitFree();
if (!ok) {
  /* 旧进程杀不掉时以前直接 exit(1)，用户看到的是 web 服务凭空消失。
     端口还占着说明旧 server 大概率还活着：把页面重新打开并留下日志，至少不是静默失败。 */
  try {
    const dir = path.join(dshHomeDir(), "dsh-purge");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "restart-web.log"),
      `${new Date().toISOString()} restart aborted: port ${port} still busy
`, "utf8");
  } catch { /* 日志失败不影响提示 */ }
  openBrowser(info.url || "");
  process.exit(1);
}

/*
 * 关键：子进程的 stdout/stderr 必须重定向到文件，不能接管道。
 *
 * 以前用 stdio:["ignore","pipe","pipe"] 读新地址，父进程读到 URL 就 exit；新 dsh 之后
 * 还会再往 stdout 打一行（"opening the default browser…"），此时管道已随父进程关闭，
 * 子进程写 pipe 触发 EPIPE 直接被干掉 —— 现象就是「重启起来一瞬间又没了」。
 * 改成写日志文件后，父进程退出不会影响子进程继续输出。
 */
const logDir = path.join(dshHomeDir(), "dsh-purge");
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `restart-web-${Date.now()}.log`);
const logFd = fs.openSync(logPath, "a");

let child;
try {
  child = spawn(info.execPath, info.argv, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    cwd: info.cwd || process.cwd(),
    env: envForDetachedSpawn(),
    windowsHide: true,
    shell: false,
  });
} finally {
  try { fs.closeSync(logFd); } catch { /* 子进程已 dup 一份 */ }
}

const note = (text) => {
  try { fs.appendFileSync(logPath, `${new Date().toISOString()} ${text}\n`); } catch { /* ignore */ }
};

if (!child || !child.pid) {
  note("spawn failed: no pid");
  process.exit(1);
}

child.on("error", (err) => note(`spawn error: ${err && err.message ? err.message : err}`));
child.on("spawn", () => {
  try { writeRecord(dshHomeDir(), port, child.pid, { host, url: "" }); } catch { /* ignore */ }
});
child.on("exit", (code, signal) => note(`child exit code=${code} signal=${signal}`));
child.unref();

const readLog = () => {
  try { return fs.readFileSync(logPath, "utf8"); } catch { return ""; }
};
const wantBrowser = info.openBrowser !== false;
const started = Date.now();
let opened = false;
while (Date.now() - started < 20000) {
  const match = readLog().match(/dsh web:\s+(https?:\/\/\S+)/);
  if (match) {
    const url = match[1].replace(/[),.;]+$/, "");
    try { writeRecord(dshHomeDir(), port, child.pid, { host, url }); } catch { /* ignore */ }
    if (wantBrowser) openBrowser(url);
    opened = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

note(opened ? "parent exit: url opened" : "parent exit: url not seen in 20s");
process.exit(0);
