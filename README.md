# process-monitor

Real-time process CPU/memory monitor TUI for macOS and Linux. A lightweight htop alternative built with zero npm dependencies — pure Node.js built-ins only.

```
process-monitor v1.0.0 — Real-time process CPU/memory TUI

CPU: 12%  RAM: 7823/8192MB (95%)  Up: 9d 20h  Load: 2.84 2.91 3.01  [8 CPUs]
Sort: [CPU] m=MEM p=PID n=NAME  Refresh: 1000ms (+/- to adjust)  q=quit k=kill

   PID NAME               CPU%     MEM%      RSS      VSZ  STAT  TIME       CPU_HIST
   440 WindowServer        41.8      1.2  102.0M  427.1G   Ss  2218:13   ▁▂▄▆▇▇▅▃▄▇
   519 syspolicyd          22.2      0.2   12.3M  415.2G   Ss    79:42   ▁▁▁▁▁▁▁▁▁▇
  1234 node                12.7      0.8   67.4M  464.3G    S  152:09   ▂▃▄▄▅▆▅▄▅▅
   448 trustd               6.6      0.1    7.9M  415.1G   Ss    28:11   ▁▁▁▁▂▂▁▁▁▂
   999 Electron             4.1      2.1  172.2M  465.4G    S    44:38   ▁▁▂▂▂▃▂▂▂▃
```

## Features

- **Interactive TUI** — live-updating process table with ANSI colors
- **System header** — CPU%, RAM used/total, uptime, load average
- **Per-process stats** — PID, name, CPU%, MEM%, RSS, VSZ, status, runtime
- **Sparklines** — 10-char CPU trend history per process using `▁▂▃▄▅▆▇█`
- **Sort** — by CPU (default), MEM, PID, or NAME
- **Filter** — type to filter processes by name in real-time
- **Kill** — select and kill processes with SIGTERM or SIGKILL
- **Watch mode** — run a command and monitor its PID automatically
- **JSON output** — machine-readable snapshot for scripting
- **CSV logging** — log metrics over time to a CSV file
- **Threshold alerts** — alert when CPU or memory exceeds a limit
- **macOS + Linux** — auto-detects OS, uses `ps aux` / `/proc`
- **Zero dependencies** — built-in Node.js modules only

## Install

```bash
# npx (no install needed)
npx process-monitor

# Global install
npm install -g process-monitor
```

## Usage

```bash
process-monitor              # Interactive TUI — all processes
pmon                         # Same, shorter alias

pmon --pid 1234              # Monitor a specific PID
pmon --name node             # Monitor processes matching "node"
pmon --watch "npm run dev"   # Run command and monitor it

pmon --json --limit 10       # JSON snapshot of top 10 by CPU
pmon --json --sort mem       # JSON snapshot sorted by memory
pmon --log metrics.csv       # Log all metrics to CSV
pmon --sort mem --limit 20   # Top 20 by memory usage

pmon --alert-cpu 80          # Alert when CPU > 80%
pmon --alert-mem 500         # Alert when RAM > 500MB
pmon --interval 500          # Refresh every 500ms
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--pid <n>` | — | Monitor a specific process by PID |
| `--name <pattern>` | — | Filter by name pattern |
| `--watch <command>` | — | Run command and monitor it |
| `--interval <ms>` | `1000` | Refresh interval in milliseconds |
| `--sort cpu\|mem\|pid\|name` | `cpu` | Sort column |
| `--limit <n>` | — | Show top N processes |
| `--json` | — | Output JSON snapshot and exit |
| `--log <file>` | — | Log metrics to CSV file |
| `--alert-cpu <pct>` | — | Alert when process CPU exceeds % |
| `--alert-mem <mb>` | — | Alert when process RSS exceeds MB |
| `--help`, `-h` | — | Show help |
| `--version`, `-v` | — | Show version |

## TUI Keybindings

| Key | Action |
|-----|--------|
| `q` | Quit |
| `c` | Sort by CPU |
| `m` | Sort by MEM |
| `p` | Sort by PID |
| `n` | Sort by NAME |
| `↑` / `↓` | Navigate process list |
| `k` | Kill selected process (SIGTERM) |
| `K` | Kill selected process (SIGKILL) |
| `+` | Increase refresh rate |
| `-` | Decrease refresh rate |
| Type | Filter by name in real-time |
| `Backspace` | Remove filter character |

## CSV Log Format

```
timestamp,pid,name,cpu_pct,mem_pct,rss_kb,vsz_kb,status
2026-03-03T09:00:00.000Z,1234,node,12.7,0.8,68640,487285056,S
```

## JSON Output Format

```json
{
  "timestamp": "2026-03-03T09:00:00.000Z",
  "system": {
    "cpuPercent": 29,
    "numCpus": 8,
    "ramUsed": 8098,
    "ramTotal": 8192,
    "ramPct": 99,
    "uptimeSec": 849496,
    "load": [3.06, 3.20, 3.06]
  },
  "processes": [
    {
      "pid": 440,
      "name": "WindowServer",
      "cpu": 41.8,
      "memPct": 1.2,
      "rss": 102000,
      "vsz": 437333088,
      "stat": "Ss",
      "time": "2218:13.16"
    }
  ]
}
```

## Platform Support

| Platform | CPU Stats | Memory Stats | Process List |
|----------|-----------|--------------|--------------|
| macOS | `top -l 1` | `os.freemem()` | `ps aux` |
| Linux | `/proc/stat` | `os.freemem()` | `ps aux` |

## Security

- Zero external npm dependencies — attack surface is Node.js built-ins only
- Uses `spawnSync`/`spawn` exclusively — no `exec` or `execSync`
- No network connections — entirely local
- All sensitive configuration via environment variables

## Requirements

- Node.js >= 18
- macOS or Linux
- Terminal with ANSI color support

## License

MIT — Nicholas Ashkar / NickCirv
