#!/usr/bin/env node
/**
 * process-monitor — Real-time process CPU/memory monitor TUI
 * htop alternative for macOS and Linux. Zero npm dependencies.
 * https://github.com/NickCirv/process-monitor
 */

import { spawnSync, spawn } from 'child_process';
import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'fs';
import { platform, uptime, loadavg, totalmem, freemem, cpus } from 'os';
import { createInterface } from 'readline';

const VERSION = '1.0.0';
const IS_MAC = platform() === 'darwin';
const IS_LINUX = platform() === 'linux';

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const A = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgRed:   '\x1b[41m',
  bgBlue:  '\x1b[44m',
  clear:   '\x1b[2J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  up:      (n) => `\x1b[${n}A`,
  col:     (n) => `\x1b[${n}G`,
  moveTo:  (r, c) => `\x1b[${r};${c}H`,
};

function colorCpu(v) {
  if (v >= 80) return A.red + A.bold;
  if (v >= 40) return A.yellow;
  return A.green;
}
function colorMem(v) {
  if (v >= 80) return A.red + A.bold;
  if (v >= 50) return A.yellow;
  return A.green;
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
const SPARK_CHARS = ' ▁▂▃▄▅▆▇█';
function sparkline(history) {
  const max = Math.max(...history, 1);
  return history.map(v => {
    const idx = Math.round((v / max) * (SPARK_CHARS.length - 1));
    return SPARK_CHARS[idx];
  }).join('');
}

// ─── Argument parsing ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    pid: null,
    name: null,
    watch: null,
    interval: 1000,
    sort: 'cpu',
    limit: null,
    json: false,
    log: null,
    alertCpu: null,
    alertMem: null,
    help: false,
    version: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pid':       opts.pid = parseInt(args[++i], 10); break;
      case '--name':      opts.name = args[++i]; break;
      case '--watch':     opts.watch = args[++i]; break;
      case '--interval':  opts.interval = parseInt(args[++i], 10); break;
      case '--sort':      opts.sort = args[++i]; break;
      case '--limit':     opts.limit = parseInt(args[++i], 10); break;
      case '--json':      opts.json = true; break;
      case '--log':       opts.log = args[++i]; break;
      case '--alert-cpu': opts.alertCpu = parseFloat(args[++i]); break;
      case '--alert-mem': opts.alertMem = parseFloat(args[++i]); break;
      case '--help': case '-h': opts.help = true; break;
      case '--version': case '-v': opts.version = true; break;
    }
  }
  return opts;
}

// ─── Help / Version ───────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${A.bold}${A.cyan}process-monitor${A.reset} v${VERSION} — Real-time process CPU/memory TUI

${A.bold}USAGE${A.reset}
  process-monitor [options]
  pmon [options]

${A.bold}OPTIONS${A.reset}
  --pid <n>           Monitor a specific process by PID
  --name <pattern>    Monitor processes matching name pattern
  --watch <command>   Run command and monitor it
  --interval <ms>     Refresh interval in ms (default: 1000)
  --sort cpu|mem|pid|name  Sort column (default: cpu)
  --limit <n>         Show top N processes
  --json              Output snapshot as JSON and exit
  --log <file>        Log metrics to CSV file
  --alert-cpu <pct>   Alert when CPU exceeds threshold (%)
  --alert-mem <mb>    Alert when memory exceeds threshold (MB)
  --help, -h          Show this help
  --version, -v       Show version

${A.bold}TUI KEYS${A.reset}
  q         Quit
  c/m/p/n   Sort by CPU / MEM / PID / NAME
  k         Kill selected process (SIGTERM)
  K         Kill selected process (SIGKILL)
  +/-       Increase/decrease refresh rate
  ↑/↓       Navigate process list
  Type      Filter processes by name

${A.bold}EXAMPLES${A.reset}
  process-monitor                    # Interactive TUI, all processes
  pmon --pid 1234                    # Monitor PID 1234
  pmon --name node                   # Monitor all node processes
  pmon --watch "npm run dev"         # Run and monitor a command
  pmon --json --limit 10             # JSON snapshot of top 10
  pmon --log metrics.csv             # Log to CSV
  pmon --sort mem --limit 20         # Top 20 by memory
  pmon --alert-cpu 80 --alert-mem 500  # Alert on thresholds
`);
}

// ─── System stats ─────────────────────────────────────────────────────────────
function getSystemStats() {
  const total = totalmem();
  const free  = freemem();
  const used  = total - free;
  const uptimeSec = uptime();
  const load  = loadavg();
  const numCpus = cpus().length;

  let cpuPercent = 0;
  if (IS_MAC) {
    cpuPercent = getMacCpuPercent();
  } else if (IS_LINUX) {
    cpuPercent = getLinuxCpuPercent();
  }

  return {
    cpuPercent,
    numCpus,
    ramUsed:  Math.round(used  / 1024 / 1024),
    ramTotal: Math.round(total / 1024 / 1024),
    ramPct:   Math.round((used / total) * 100),
    uptimeSec,
    load,
  };
}

// macOS CPU via top -l 1 (lightweight single shot)
let _lastMacCpu = 0;
function getMacCpuPercent() {
  try {
    const r = spawnSync('top', ['-l', '1', '-n', '0', '-stats', 'cpu'], { encoding: 'utf8', timeout: 3000 });
    if (r.status !== 0 || !r.stdout) return _lastMacCpu;
    const m = r.stdout.match(/CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys/);
    if (m) {
      _lastMacCpu = Math.round(parseFloat(m[1]) + parseFloat(m[2]));
      return _lastMacCpu;
    }
  } catch (_) {}
  return _lastMacCpu;
}

// Linux CPU via /proc/stat diff
let _lastLinuxStat = null;
function getLinuxCpuPercent() {
  try {
    const raw = readFileSync('/proc/stat', 'utf8');
    const line = raw.split('\n')[0]; // cpu aggregate
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3];
    const total = parts.reduce((a, b) => a + b, 0);
    if (_lastLinuxStat) {
      const dIdle  = idle  - _lastLinuxStat.idle;
      const dTotal = total - _lastLinuxStat.total;
      _lastLinuxStat = { idle, total };
      return dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
    }
    _lastLinuxStat = { idle, total };
  } catch (_) {}
  return 0;
}

// ─── Process list ─────────────────────────────────────────────────────────────
function getProcesses(filterPid, filterName) {
  if (IS_MAC || IS_LINUX) {
    return getPsProcesses(filterPid, filterName);
  }
  return [];
}

function getPsProcesses(filterPid, filterName) {
  const args = ['aux', '--no-headers'];
  // macOS ps doesn't support --no-headers but ignores it safely
  const r = spawnSync('ps', IS_MAC ? ['aux'] : ['aux', '--no-headers'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (r.status !== 0 || !r.stdout) return [];

  const lines = r.stdout.trim().split('\n');
  // Skip header line on macOS
  const dataLines = IS_MAC ? lines.slice(1) : lines;

  const procs = [];
  const now = Date.now();

  for (const line of dataLines) {
    if (!line.trim()) continue;
    // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    const cols = line.trim().split(/\s+/);
    if (cols.length < 11) continue;

    const pid    = parseInt(cols[1], 10);
    const cpu    = parseFloat(cols[2]);
    const memPct = parseFloat(cols[3]);
    const vsz    = parseInt(cols[4], 10);   // KB
    const rss    = parseInt(cols[5], 10);   // KB
    const stat   = cols[7];
    const start  = cols[8];
    const time   = cols[9];
    const cmd    = cols.slice(10).join(' ');
    const name   = cmd.split('/').pop().split(' ')[0].substring(0, 20);

    if (filterPid && pid !== filterPid) continue;
    if (filterName) {
      const pat = filterName.toLowerCase();
      if (!name.toLowerCase().includes(pat) && !cmd.toLowerCase().includes(pat)) continue;
    }

    procs.push({ pid, name, cmd, cpu, memPct, vsz, rss, stat, start, time });
  }

  return procs;
}

// Linux: supplement with /proc data for more accurate per-pid stats
function getLinuxProcStat(pid) {
  try {
    const stat   = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const utime  = parseInt(stat[13], 10);
    const stime  = parseInt(stat[14], 10);
    const vmRss  = status.match(/VmRSS:\s+(\d+)/)?.[1];
    return { utime, stime, vmRss: vmRss ? parseInt(vmRss, 10) : 0 };
  } catch (_) {
    return null;
  }
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
function sortProcesses(procs, sortBy) {
  return [...procs].sort((a, b) => {
    switch (sortBy) {
      case 'mem':  return b.memPct - a.memPct;
      case 'pid':  return a.pid - b.pid;
      case 'name': return a.name.localeCompare(b.name);
      case 'cpu':
      default:     return b.cpu - a.cpu;
    }
  });
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMem(kb) {
  if (kb >= 1048576) return (kb / 1048576).toFixed(1) + 'G';
  if (kb >= 1024)    return (kb / 1024).toFixed(1) + 'M';
  return kb + 'K';
}

function pad(s, n, right = false) {
  const str = String(s).substring(0, n);
  return right ? str.padStart(n) : str.padEnd(n);
}

// ─── CSV Logger ───────────────────────────────────────────────────────────────
function initLog(file) {
  if (!existsSync(file)) {
    writeFileSync(file, 'timestamp,pid,name,cpu_pct,mem_pct,rss_kb,vsz_kb,status\n');
  }
}

function logToFile(file, procs) {
  const ts = new Date().toISOString();
  const rows = procs.map(p =>
    `${ts},${p.pid},"${p.name}",${p.cpu},${p.memPct},${p.rss},${p.vsz},${p.stat}`
  ).join('\n');
  appendFileSync(file, rows + '\n');
}

// ─── JSON snapshot ────────────────────────────────────────────────────────────
function jsonSnapshot(opts) {
  const sys  = getSystemStats();
  const procs = getProcesses(opts.pid, opts.name);
  let sorted  = sortProcesses(procs, opts.sort);
  if (opts.limit) sorted = sorted.slice(0, opts.limit);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), system: sys, processes: sorted }, null, 2));
}

// ─── Alert checker ────────────────────────────────────────────────────────────
function checkAlerts(procs, alertCpu, alertMem) {
  const alerts = [];
  for (const p of procs) {
    if (alertCpu !== null && p.cpu >= alertCpu) {
      alerts.push(`ALERT: ${p.name} (PID ${p.pid}) CPU ${p.cpu}% >= ${alertCpu}%`);
    }
    if (alertMem !== null && (p.rss / 1024) >= alertMem) {
      alerts.push(`ALERT: ${p.name} (PID ${p.pid}) MEM ${(p.rss/1024).toFixed(1)}MB >= ${alertMem}MB`);
    }
  }
  return alerts;
}

// ─── TUI State ────────────────────────────────────────────────────────────────
const state = {
  procs:      [],
  selected:   0,
  sortBy:     'cpu',
  filter:     '',
  interval:   1000,
  scrollTop:  0,
  history:    {},   // pid -> cpu history array (10 items)
  running:    true,
  watchPid:   null,
};

// ─── TUI Render ───────────────────────────────────────────────────────────────
function render(sys, procs, termCols, termRows) {
  const lines = [];

  // Header bar
  const loadStr = sys.load.map(l => l.toFixed(2)).join(' ');
  const header = [
    `${A.bold}${A.cyan}process-monitor${A.reset} v${VERSION}`,
    `CPU: ${colorCpu(sys.cpuPercent)}${sys.cpuPercent}%${A.reset}`,
    `RAM: ${colorMem(sys.ramPct)}${sys.ramUsed}/${sys.ramTotal}MB (${sys.ramPct}%)${A.reset}`,
    `Up: ${A.white}${fmtUptime(sys.uptimeSec)}${A.reset}`,
    `Load: ${A.white}${loadStr}${A.reset}`,
    `${A.dim}[${sys.numCpus} CPUs]${A.reset}`,
  ].join('  ');
  lines.push(header);

  // Sort indicator line
  const sortKeys = ['c=CPU', 'm=MEM', 'p=PID', 'n=NAME'].map(s => {
    const key = s[0];
    const full = s.slice(2);
    const active = (state.sortBy === { c:'cpu',m:'mem',p:'pid',n:'name' }[key]);
    return active ? `${A.bold}${A.yellow}[${full}]${A.reset}` : `${A.dim}${s}${A.reset}`;
  }).join(' ');
  const filterStr = state.filter ? `  Filter: ${A.yellow}${state.filter}${A.reset}` : '';
  const rateStr   = `  Refresh: ${state.interval}ms (+/- to adjust)`;
  lines.push(`Sort: ${sortKeys}${filterStr}${rateStr}  ${A.dim}q=quit k=kill(TERM) K=kill(KILL)${A.reset}`);

  // Table header
  const colW = { pid: 7, name: 18, cpu: 7, mem: 7, rss: 8, vsz: 8, stat: 6, time: 8, spark: 10 };
  const hdr = [
    A.bold + A.bgBlue + A.white,
    pad('PID',   colW.pid,  true),  ' ',
    pad('NAME',  colW.name),        ' ',
    pad('CPU%',  colW.cpu,  true),  ' ',
    pad('MEM%',  colW.mem,  true),  ' ',
    pad('RSS',   colW.rss,  true),  ' ',
    pad('VSZ',   colW.vsz,  true),  ' ',
    pad('STAT',  colW.stat),        ' ',
    pad('TIME',  colW.time),        ' ',
    pad('CPU_HIST', colW.spark),
    A.reset,
  ].join('');
  lines.push(hdr);

  // Process rows
  const maxRows = termRows - 6;
  const visible = procs.slice(state.scrollTop, state.scrollTop + maxRows);

  for (let i = 0; i < visible.length; i++) {
    const p   = visible[i];
    const idx = state.scrollTop + i;
    const sel = idx === state.selected;

    // Update history
    if (!state.history[p.pid]) state.history[p.pid] = Array(10).fill(0);
    state.history[p.pid].push(p.cpu);
    if (state.history[p.pid].length > 10) state.history[p.pid].shift();

    const spark = sparkline(state.history[p.pid]);
    const cpuC  = colorCpu(p.cpu);
    const memC  = colorMem(p.memPct);
    const prefix = sel ? A.bgBlue + A.white : '';
    const suffix = sel ? A.reset : A.reset;

    const row = [
      prefix,
      pad(p.pid,       colW.pid,  true),  ' ',
      pad(p.name,      colW.name),        ' ',
      cpuC + pad(p.cpu.toFixed(1), colW.cpu, true)  + A.reset + (sel ? A.bgBlue + A.white : ''), ' ',
      memC + pad(p.memPct.toFixed(1), colW.mem, true) + A.reset + (sel ? A.bgBlue + A.white : ''), ' ',
      pad(fmtMem(p.rss), colW.rss, true),  ' ',
      pad(fmtMem(p.vsz), colW.vsz, true),  ' ',
      pad(p.stat,      colW.stat),         ' ',
      pad(p.time,      colW.time),         ' ',
      A.dim + spark + A.reset + (sel ? A.bgBlue + A.white : ''),
      suffix,
    ].join('');
    lines.push(row);
  }

  // Footer
  lines.push(`${A.dim}${procs.length} processes  |  Selected: ${procs[state.selected]?.name ?? '-'} (PID ${procs[state.selected]?.pid ?? '-'})${A.reset}`);

  return lines.join('\n');
}

// ─── Kill process ─────────────────────────────────────────────────────────────
function killProcess(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal);
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Main TUI loop ────────────────────────────────────────────────────────────
function startTUI(opts) {
  state.sortBy   = opts.sort;
  state.interval = opts.interval;

  process.stdout.write(A.hideCursor);
  process.stdout.write(A.clear);

  // Raw mode for key input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  if (opts.log) initLog(opts.log);

  let filterInput = '';

  process.stdin.on('data', (key) => {
    if (key === 'q' || key === '\x03') {
      // quit
      cleanup();
      return;
    }
    if (key === 'c') { state.sortBy = 'cpu';  redraw(); return; }
    if (key === 'm') { state.sortBy = 'mem';  redraw(); return; }
    if (key === 'p') { state.sortBy = 'pid';  redraw(); return; }
    if (key === 'n') { state.sortBy = 'name'; redraw(); return; }
    if (key === '+') { state.interval = Math.max(200, state.interval - 200); redraw(); return; }
    if (key === '-') { state.interval = Math.min(10000, state.interval + 200); restartTimer(); return; }
    if (key === '\x1b[A' || key === 'k' && !process.stdin.isRaw) { // Up arrow
      if (key === '\x1b[A') { state.selected = Math.max(0, state.selected - 1); clampScroll(); redraw(); return; }
    }
    if (key === '\x1b[B') { // Down arrow
      state.selected = Math.min(state.procs.length - 1, state.selected + 1);
      clampScroll(); redraw(); return;
    }
    if (key === 'k') {
      const p = state.procs[state.selected];
      if (p) killProcess(p.pid, 'SIGTERM');
      redraw(); return;
    }
    if (key === 'K') {
      const p = state.procs[state.selected];
      if (p) killProcess(p.pid, 'SIGKILL');
      redraw(); return;
    }
    if (key === '\x7f' || key === '\x08') {
      // Backspace — remove last filter char
      state.filter = state.filter.slice(0, -1);
      state.selected = 0;
      redraw(); return;
    }
    // Printable characters → filter
    if (key.length === 1 && key >= ' ') {
      state.filter += key;
      state.selected = 0;
      redraw(); return;
    }
  });

  function clampScroll() {
    const maxRows = (process.stdout.rows ?? 24) - 6;
    if (state.selected < state.scrollTop) state.scrollTop = state.selected;
    if (state.selected >= state.scrollTop + maxRows) state.scrollTop = state.selected - maxRows + 1;
  }

  function redraw() {
    const sys   = getSystemStats();
    let procs   = getProcesses(opts.pid, opts.name || state.filter || null);
    if (state.filter && !opts.name) {
      procs = procs.filter(p =>
        p.name.toLowerCase().includes(state.filter.toLowerCase()) ||
        p.cmd.toLowerCase().includes(state.filter.toLowerCase())
      );
    }
    procs = sortProcesses(procs, state.sortBy);
    if (opts.limit) procs = procs.slice(0, opts.limit);
    state.procs = procs;
    if (state.selected >= procs.length) state.selected = Math.max(0, procs.length - 1);

    if (opts.log) logToFile(opts.log, procs);

    const alerts = checkAlerts(procs, opts.alertCpu, opts.alertMem);
    if (alerts.length > 0 && !process.env.PMON_NO_ALERT) {
      for (const a of alerts) process.stderr.write(a + '\n');
    }

    const cols = process.stdout.columns ?? 120;
    const rows = process.stdout.rows ?? 40;
    const frame = render(sys, procs, cols, rows);
    process.stdout.write(A.clear + frame);
  }

  let timer = null;
  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(redraw, state.interval);
  }

  // Initial draw
  redraw();
  restartTimer();

  function cleanup() {
    if (timer) clearInterval(timer);
    process.stdout.write(A.showCursor);
    process.stdout.write(A.clear);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.exit(0);
  }

  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit',    () => process.stdout.write(A.showCursor));
}

// ─── --watch mode ─────────────────────────────────────────────────────────────
function watchCommand(cmd, opts) {
  const parts = cmd.split(' ');
  const bin   = parts[0];
  const args  = parts.slice(1);

  const child = spawn(bin, args, { stdio: 'inherit', detached: false });
  state.watchPid = child.pid;
  opts.pid = child.pid;
  opts.name = null;

  child.on('exit', (code) => {
    process.stdout.write(`\n${A.yellow}Watched process exited with code ${code}${A.reset}\n`);
    state.watchPid = null;
  });

  startTUI(opts);
}

// ─── Entry point ──────────────────────────────────────────────────────────────
(function main() {
  const opts = parseArgs(process.argv);

  if (opts.version) {
    console.log(`process-monitor v${VERSION}`);
    process.exit(0);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.json) {
    jsonSnapshot(opts);
    process.exit(0);
  }

  if (opts.watch) {
    watchCommand(opts.watch, opts);
    return;
  }

  startTUI(opts);
})();
