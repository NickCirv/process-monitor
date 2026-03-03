# process-monitor

> Real-time process monitor. Watch CPU, memory, threads for any process. Zero dependencies.

```
╭──────────────────────────── PROCESS MONITOR ─────────────────────────────╮
│ node  PID: 18423  PPID: 18420  State: S  LIVE   10:42:31                 │
│ Uptime: 2h 14m 7s   Threads: 7   FDs: 32                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ CPU    12.4%  ████░░░░░░░░░░░░░░░░  ▁▁▂▃▄▃▂▁▂▃▄▅▄▃▂▁▂▃▄▄               │
│ MEM   128.0 MB  RSS   ████████░░░░░░░░░░░░  ▂▂▂▃▃▃▃▄▄▄▄▄▄▄▄▄▄▄▄▄       │
│       VSZ  256.0 MB                                                       │
│       Heap  64.0 MB / 128.0 MB                                            │
├──────────────────────────────────────────────────────────────────────────┤
│ [q] Quit   [p] Pause/Resume   [r] Reset sparklines   Interval: 1s        │
╰──────────────────────────────────────────────────────────────────────────╯
```

## Install

```bash
# Run without installing
npx process-monitor <pid>

# Install globally
npm install -g process-monitor
```

## Quick Start

```bash
# Monitor by PID
pmon 1234

# Monitor by name
pmon --name node

# Match by command substring
pmon --name "npm run"

# Faster refresh + alerts + logging
pmon 1234 --interval 0.5 --alert-cpu 80 --alert-mem 500MB --log metrics.csv
```

## Options

| Flag | Alias | Description |
|------|-------|-------------|
| `<pid>` | | Monitor a specific PID |
| `--name <str>` | `-n` | Find process by name or command substring |
| `--interval <secs>` | `-i` | Refresh interval in seconds (default: 1) |
| `--log <file>` | `-l` | Save metrics as CSV (timestamp, cpu, mem_rss, heap) |
| `--alert-cpu <pct>` | | Warn when CPU exceeds threshold (e.g. `80`) |
| `--alert-mem <size>` | | Warn when memory exceeds threshold (e.g. `500MB`) |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

## Controls

| Key | Action |
|-----|--------|
| `q` | Quit |
| `p` | Pause / Resume |
| `r` | Reset sparkline graphs |

## What It Shows

- **Process info**: name, PID, PPID, state
- **CPU %**: real-time with progress bar and 30-point sparkline
- **Memory**: RSS, VSZ, heap used/total
- **Threads**: thread count
- **FDs**: open file descriptor count
- **Uptime**: time since process start
- **Sparklines**: rolling 30-sample graphs using ▁▂▃▄▅▆▇█
- **Children**: list of child processes
- **Alerts**: highlighted warnings when thresholds are exceeded

## Platform Support

| Feature | Linux | macOS |
|---------|-------|-------|
| CPU % | `/proc/stat` (precise) | `ps` |
| Memory RSS/VSZ | `/proc/{pid}/status` | `ps` |
| Heap | `/proc/{pid}/statm` | N/A |
| Threads | `/proc/{pid}/stat` | `ps` |
| FDs | `/proc/{pid}/fd` count | `lsof` |
| Uptime | `/proc/{pid}/stat` + `/proc/uptime` | `ps lstart` |
| Children | `ps --ppid` | `ps --ppid` |

## CSV Log Format

```csv
timestamp,cpu_pct,mem_rss_bytes,heap_used_bytes
2026-03-03T10:42:31.000Z,12.40,134217728,67108864
```

## Why?

`htop` is great for overall system view. `process-monitor` is for when you're watching a single process — debugging a memory leak, profiling CPU spikes, or keeping an eye on a long-running job. Single-process focus means you get sparkline history, threshold alerts, and CSV logging without noise.

---

Built with Node.js · Zero dependencies · MIT License
