#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { createInterface } from 'readline';
import { platform } from 'os';
import { argv, stdout, exit, stdin } from 'process';

const IS_LINUX = platform() === 'linux';
const IS_MACOS = platform() === 'darwin';

// --- CLI PARSING ---

function parseArgs(args) {
  const opts = {
    pid: null,
    name: null,
    interval: 1,
    log: null,
    alertCpu: null,
    alertMem: null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--name' || a === '-n') {
      opts.name = args[++i];
    } else if (a === '--interval' || a === '-i') {
      opts.interval = parseFloat(args[++i]) || 1;
    } else if (a === '--log' || a === '-l') {
      opts.log = args[++i];
    } else if (a === '--alert-cpu') {
      opts.alertCpu = parseFloat(args[++i]);
    } else if (a === '--alert-mem') {
      opts.alertMem = parseMem(args[++i]);
    } else if (a === '--help' || a === '-h') {
      printHelp();
      exit(0);
    } else if (a === '--version' || a === '-v') {
      console.log('1.0.0');
      exit(0);
    } else if (/^\d+$/.test(a)) {
      opts.pid = parseInt(a, 10);
    }
  }

  return opts;
}

function parseMem(s) {
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(KB|MB|GB|B)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'MB').toUpperCase();
  const mul = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
  return n * (mul[unit] || mul.MB);
}

function printHelp() {
  console.log(`
process-monitor v1.0.0

USAGE
  pmon <pid>                   Monitor a process by PID
  pmon --name <string>         Find and monitor by name/command substring

OPTIONS
  --name,       -n <str>       Match process by name or command substring
  --interval,   -i <secs>      Refresh interval in seconds (default: 1)
  --log,        -l <file>      Log metrics to CSV file
  --alert-cpu      <pct>       Warn when CPU exceeds threshold (e.g. 80)
  --alert-mem      <size>      Warn when memory exceeds threshold (e.g. 500MB)
  --help,       -h             Show this help
  --version,    -v             Show version

CONTROLS
  q    Quit
  p    Pause / Resume
  r    Reset sparklines

EXAMPLES
  pmon 1234
  pmon --name node
  pmon --name "npm run" --interval 2
  pmon 1234 --alert-cpu 80 --alert-mem 500MB --log metrics.csv
`);
}

// --- PROCESS DISCOVERY ---

function findPidByName(name) {
  if (IS_LINUX || IS_MACOS) {
    const res = spawnSync('ps', ['axo', 'pid,command'], { encoding: 'utf8' });
    if (res.status !== 0) return null;
    const lines = res.stdout.trim().split('\n').slice(1);
    for (const line of lines) {
      const m = line.trim().match(/^(\d+)\s+(.+)$/);
      if (m && m[2].includes(name)) {
        const pid = parseInt(m[1], 10);
        // Skip our own process
        if (pid === process.pid) continue;
        return pid;
      }
    }
  }
  return null;
}

// --- METRICS: LINUX ---

function readLinuxStat(pid) {
  const path = `/proc/${pid}/stat`;
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  // comm can contain spaces/parens; extract carefully
  const match = raw.match(/^\d+ \((.+)\) (.+)$/);
  if (!match) return null;
  const comm = match[1];
  const rest = match[2].split(' ');
  return {
    comm,
    state: rest[0],
    ppid: parseInt(rest[1], 10),
    utime: parseInt(rest[11], 10),
    stime: parseInt(rest[12], 10),
    numThreads: parseInt(rest[17], 10),
    starttime: parseInt(rest[19], 10),
  };
}

function readLinuxStatus(pid) {
  const path = `/proc/${pid}/status`;
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n');
  const out = {};
  for (const line of lines) {
    const [k, v] = line.split(':').map(s => s.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

function readLinuxFdCount(pid) {
  const path = `/proc/${pid}/fd`;
  if (!existsSync(path)) return 0;
  try {
    return readdirSync(path).length;
  } catch {
    return 0;
  }
}

function readLinuxGlobalStat() {
  const raw = readFileSync('/proc/stat', 'utf8');
  const line = raw.split('\n')[0];
  const parts = line.split(/\s+/).slice(1).map(Number);
  const total = parts.reduce((a, b) => a + b, 0);
  const idle = parts[3] + (parts[4] || 0);
  return { total, idle };
}

function readLinuxUptime(pid, starttime) {
  const boottime = readFileSync('/proc/uptime', 'utf8').trim().split(' ');
  const uptimeSecs = parseFloat(boottime[0]);
  const hz = 100; // CLK_TCK
  const bootEpoch = Date.now() / 1000 - uptimeSecs;
  const startEpoch = bootEpoch + starttime / hz;
  return Date.now() / 1000 - startEpoch;
}

let _prevLinuxStat = null;
let _prevGlobalStat = null;

function getLinuxMetrics(pid) {
  const stat = readLinuxStat(pid);
  if (!stat) return null;

  const status = readLinuxStatus(pid);
  const fdCount = readLinuxFdCount(pid);
  const globalStat = readLinuxGlobalStat();

  // CPU %
  const procTicks = stat.utime + stat.stime;
  let cpuPct = 0;
  if (_prevLinuxStat && _prevGlobalStat) {
    const dProc = procTicks - (_prevLinuxStat.utime + _prevLinuxStat.stime);
    const dTotal = globalStat.total - _prevGlobalStat.total;
    cpuPct = dTotal > 0 ? (dProc / dTotal) * 100 : 0;
  }

  _prevLinuxStat = stat;
  _prevGlobalStat = globalStat;

  const pageSize = 4096;
  const vmRSS = status ? parseInt(status['VmRSS'] || '0') * 1024 : 0;
  const vmVSZ = status ? parseInt(status['VmSize'] || '0') * 1024 : 0;

  // Heap from /proc/{pid}/statm
  let heapUsed = 0, heapTotal = 0;
  const statmPath = `/proc/${pid}/statm`;
  if (existsSync(statmPath)) {
    const parts = readFileSync(statmPath, 'utf8').trim().split(' ').map(Number);
    heapTotal = parts[1] * pageSize;
    heapUsed = parts[5] * pageSize;
  }

  const uptime = readLinuxUptime(pid, stat.starttime);

  // Children
  const children = getChildPids(pid);

  return {
    name: stat.comm,
    pid,
    ppid: stat.ppid,
    state: stat.state,
    cpuPct,
    memRSS: vmRSS,
    memVSZ: vmVSZ,
    heapUsed,
    heapTotal,
    threads: stat.numThreads,
    fds: fdCount,
    uptime,
    children,
  };
}

// --- METRICS: MACOS ---

let _prevMacCpu = null;
let _prevMacTime = null;

function getMacMetrics(pid) {
  // ps -p <pid> -o pid,ppid,state,rss,vsz,nlwp,lstart,comm,command
  const res = spawnSync('ps', ['-p', String(pid), '-o', 'pid=,ppid=,state=,rss=,vsz=,nlwp=,lstart=,comm='], {
    encoding: 'utf8',
  });
  if (res.status !== 0 || !res.stdout.trim()) return null;

  const line = res.stdout.trim();
  // lstart format: "Tue Mar  3 10:00:00 2026" — 24 chars from col 5 onward after splitting
  // We use a different approach: parse fields manually
  const parts = line.trim().split(/\s+/);
  const pid2 = parseInt(parts[0], 10);
  const ppid = parseInt(parts[1], 10);
  const state = parts[2];
  const rss = parseInt(parts[3], 10) * 1024; // ps gives KB
  const vsz = parseInt(parts[4], 10) * 1024;
  const nlwp = parseInt(parts[5], 10);
  // lstart is 5 tokens: "Tue Mar 3 10:00:00 2026"
  const lstartStr = parts.slice(6, 11).join(' ');
  const comm = parts[11] || 'unknown';

  // CPU via top or ps with %cpu
  const cpuRes = spawnSync('ps', ['-p', String(pid), '-o', '%cpu=,%mem='], { encoding: 'utf8' });
  const cpuLine = cpuRes.stdout.trim();
  const cpuParts = cpuLine.split(/\s+/);
  const cpuPct = parseFloat(cpuParts[0]) || 0;

  // Uptime from lstart
  const startMs = Date.parse(lstartStr);
  const uptime = isNaN(startMs) ? 0 : (Date.now() - startMs) / 1000;

  // FD count via lsof
  const lsofRes = spawnSync('lsof', ['-p', String(pid)], { encoding: 'utf8' });
  const fdCount = lsofRes.status === 0
    ? Math.max(0, lsofRes.stdout.trim().split('\n').length - 1)
    : 0;

  const children = getChildPids(pid);

  return {
    name: comm,
    pid: pid2,
    ppid,
    state,
    cpuPct,
    memRSS: rss,
    memVSZ: vsz,
    heapUsed: 0,
    heapTotal: 0,
    threads: nlwp,
    fds: fdCount,
    uptime,
    children,
  };
}

function getChildPids(pid) {
  const res = spawnSync('ps', ['--ppid', String(pid), '-o', 'pid=,comm='], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  return res.stdout.trim().split('\n').map(l => {
    const p = l.trim().split(/\s+/);
    return { pid: parseInt(p[0], 10), name: p.slice(1).join(' ') };
  }).filter(c => !isNaN(c.pid));
}

function getMetrics(pid) {
  if (IS_LINUX) return getLinuxMetrics(pid);
  if (IS_MACOS) return getMacMetrics(pid);
  return null;
}

// --- SPARKLINE ---

const SPARKS = '▁▂▃▄▅▆▇█';

function sparkline(values, max) {
  const m = max || Math.max(...values, 1);
  return values.map(v => {
    const idx = Math.min(Math.floor((v / m) * (SPARKS.length - 1)), SPARKS.length - 1);
    return SPARKS[idx];
  }).join('');
}

// --- FORMATTING ---

function fmtBytes(b) {
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function fmtUptime(secs) {
  if (secs < 0 || isNaN(secs)) return '0s';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtTime(dt) {
  return dt.toTimeString().slice(0, 8);
}

function pad(s, n) {
  return String(s).padEnd(n);
}

function rpad(s, n) {
  return String(s).padStart(n);
}

// --- ANSI HELPERS ---

const A = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightWhite: '\x1b[97m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
  clear: '\x1b[2J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

function colorCpu(pct) {
  if (pct >= 80) return A.red;
  if (pct >= 50) return A.yellow;
  return A.green;
}

function colorMem(bytes, alertBytes) {
  if (alertBytes && bytes >= alertBytes) return A.red;
  return A.cyan;
}

// --- TUI RENDER ---

const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  ml: '├', mr: '┤', mt: '┬', mb: '┴',
};

function boxTop(w, title) {
  const inner = w - 2;
  if (title) {
    const t = ` ${title} `;
    const left = Math.floor((inner - t.length) / 2);
    const right = inner - left - t.length;
    return BOX.tl + BOX.h.repeat(left) + A.bold + A.cyan + t + A.reset + BOX.h.repeat(right) + BOX.tr;
  }
  return BOX.tl + BOX.h.repeat(inner) + BOX.tr;
}

function boxBot(w) {
  return BOX.bl + BOX.h.repeat(w - 2) + BOX.br;
}

function boxRow(content, w) {
  // Strip ANSI for length calculation
  const stripped = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad2 = Math.max(0, w - 2 - stripped.length);
  return BOX.v + ' ' + content + ' '.repeat(pad2 - 1) + BOX.v;
}

function buildFrame(metrics, history, opts, paused, alerts) {
  const W = Math.min(stdout.columns || 80, 100);
  const lines = [];
  const now = new Date();

  // Header
  lines.push(boxTop(W, 'PROCESS MONITOR'));

  const statusStr = paused ? `${A.yellow}PAUSED${A.reset}` : `${A.green}LIVE${A.reset}`;
  const timeStr = `${A.dim}${fmtTime(now)}${A.reset}`;
  lines.push(boxRow(`${A.bold}${A.brightWhite}${metrics.name}${A.reset}  PID: ${A.cyan}${metrics.pid}${A.reset}  PPID: ${metrics.ppid}  State: ${A.yellow}${metrics.state}${A.reset}  ${statusStr}   ${timeStr}`, W));
  lines.push(boxRow(`${A.dim}Uptime: ${fmtUptime(metrics.uptime)}   Threads: ${metrics.threads}   FDs: ${metrics.fds}${A.reset}`, W));

  lines.push(BOX.ml + BOX.h.repeat(W - 2) + BOX.mr);

  // CPU
  const cpuColor = colorCpu(metrics.cpuPct);
  const cpuBar = buildBar(metrics.cpuPct, 100, 20, cpuColor);
  const cpuSpark = history.cpu.length > 1 ? sparkline(history.cpu, 100) : '';
  lines.push(boxRow(`${A.bold}CPU  ${A.reset}${cpuColor}${metrics.cpuPct.toFixed(1).padStart(5)}%${A.reset}  ${cpuBar}  ${A.dim}${cpuSpark}${A.reset}`, W));

  // Memory RSS
  const memColor = colorMem(metrics.memRSS, opts.alertMem);
  const memBar = buildBar(metrics.memRSS, opts.alertMem ? opts.alertMem * 1.5 : metrics.memRSS * 2 || 1e8, 20, memColor);
  const memSpark = history.mem.length > 1 ? sparkline(history.mem) : '';
  lines.push(boxRow(`${A.bold}MEM  ${A.reset}${memColor}${fmtBytes(metrics.memRSS).padStart(9)}${A.reset}  RSS   ${memBar}  ${A.dim}${memSpark}${A.reset}`, W));
  lines.push(boxRow(`${A.dim}     VSZ  ${fmtBytes(metrics.memVSZ).padStart(9)}${A.reset}`, W));

  if (metrics.heapUsed > 0 || metrics.heapTotal > 0) {
    lines.push(boxRow(`${A.dim}     Heap ${fmtBytes(metrics.heapUsed).padStart(9)} / ${fmtBytes(metrics.heapTotal)}${A.reset}`, W));
  }

  lines.push(BOX.ml + BOX.h.repeat(W - 2) + BOX.mr);

  // Alerts
  for (const alert of alerts) {
    lines.push(boxRow(`${A.bgRed}${A.bold} ALERT ${A.reset} ${A.red}${alert}${A.reset}`, W));
  }
  if (alerts.length > 0) {
    lines.push(BOX.ml + BOX.h.repeat(W - 2) + BOX.mr);
  }

  // Children
  if (metrics.children.length > 0) {
    lines.push(boxRow(`${A.bold}Children (${metrics.children.length})${A.reset}`, W));
    const shown = metrics.children.slice(0, 5);
    for (const c of shown) {
      lines.push(boxRow(`${A.dim}  ${c.pid.toString().padStart(7)}  ${c.name}${A.reset}`, W));
    }
    if (metrics.children.length > 5) {
      lines.push(boxRow(`${A.dim}  … and ${metrics.children.length - 5} more${A.reset}`, W));
    }
    lines.push(BOX.ml + BOX.h.repeat(W - 2) + BOX.mr);
  }

  // Controls
  lines.push(boxRow(`${A.dim}[q] Quit   [p] Pause/Resume   [r] Reset sparklines   Interval: ${opts.interval}s${A.reset}`, W));
  lines.push(boxBot(W));

  return lines.join('\n');
}

function buildBar(val, max, width, color) {
  const filled = Math.min(Math.round((val / max) * width), width);
  return color + '█'.repeat(filled) + A.dim + '░'.repeat(width - filled) + A.reset;
}

// --- CSV LOGGING ---

function logCSV(file, metrics) {
  const row = [
    new Date().toISOString(),
    metrics.cpuPct.toFixed(2),
    metrics.memRSS,
    metrics.heapUsed,
  ].join(',') + '\n';
  appendFileSync(file, row);
}

function initCSV(file) {
  if (!existsSync(file)) {
    writeFileSync(file, 'timestamp,cpu_pct,mem_rss_bytes,heap_used_bytes\n');
  }
}

// --- MAIN ---

async function main() {
  const args = argv.slice(2);
  if (args.length === 0) {
    printHelp();
    exit(0);
  }

  const opts = parseArgs(args);

  // Resolve PID
  let pid = opts.pid;
  if (!pid && opts.name) {
    pid = findPidByName(opts.name);
    if (!pid) {
      console.error(`\x1b[31mError: no process found matching "${opts.name}"\x1b[0m`);
      exit(1);
    }
    console.error(`Found PID ${pid} for "${opts.name}"`);
  }

  if (!pid) {
    console.error('\x1b[31mError: provide a PID or --name\x1b[0m');
    printHelp();
    exit(1);
  }

  // CSV log init
  if (opts.log) initCSV(opts.log);

  // History buffers (last 30 samples)
  const HIST = 30;
  const history = { cpu: [], mem: [] };

  let paused = false;
  let running = true;

  // Raw mode for keypress
  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.setEncoding('utf8');
  stdin.on('data', key => {
    if (key === 'q' || key === '\u0003') {
      cleanup();
    } else if (key === 'p') {
      paused = !paused;
    } else if (key === 'r') {
      history.cpu.length = 0;
      history.mem.length = 0;
    }
  });

  function cleanup() {
    running = false;
    stdout.write(A.showCursor);
    stdout.write('\n');
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    exit(0);
  }

  stdout.write(A.hideCursor);

  async function tick() {
    if (!running) return;

    if (!paused) {
      const metrics = getMetrics(pid);
      if (!metrics) {
        stdout.write(A.clear);
        stdout.write(`\x1b[31mProcess ${pid} not found or exited.\x1b[0m\n`);
        stdout.write(`${A.dim}Waiting...${A.reset}\n`);
        // Don't exit — process may restart with same PID
        setTimeout(tick, opts.interval * 1000);
        return;
      }

      // Update history
      history.cpu.push(metrics.cpuPct);
      history.mem.push(metrics.memRSS);
      if (history.cpu.length > HIST) history.cpu.shift();
      if (history.mem.length > HIST) history.mem.shift();

      // Alerts
      const alerts = [];
      if (opts.alertCpu !== null && metrics.cpuPct > opts.alertCpu) {
        alerts.push(`CPU ${metrics.cpuPct.toFixed(1)}% exceeds threshold ${opts.alertCpu}%`);
      }
      if (opts.alertMem !== null && metrics.memRSS > opts.alertMem) {
        alerts.push(`Memory ${fmtBytes(metrics.memRSS)} exceeds threshold ${fmtBytes(opts.alertMem)}`);
      }

      // Render
      const frame = buildFrame(metrics, history, opts, paused, alerts);
      stdout.write(A.clear + frame + '\n');

      // Log CSV
      if (opts.log) logCSV(opts.log, metrics);
    }

    setTimeout(tick, opts.interval * 1000);
  }

  tick();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  exit(1);
});
