<div align="center">

# process-monitor

**Real-time process CPU/memory TUI — a zero-dependency htop alternative for macOS and Linux**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-blue?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/process-monitor
```

## Usage

```bash
# Interactive TUI — all processes
npx github:NickCirv/process-monitor

# Short alias after global install
npm install -g github:NickCirv/process-monitor
pmon --sort mem --limit 20
pmon --watch "npm run dev"
pmon --json --limit 10
```

| Flag | Description |
|------|-------------|
| `--pid <n>` | Monitor a specific process by PID |
| `--name <pattern>` | Filter by name pattern |
| `--watch <command>` | Run command and monitor its PID |
| `--sort cpu\|mem\|pid\|name` | Sort column (default: `cpu`) |
| `--limit <n>` | Show top N processes |
| `--interval <ms>` | Refresh interval (default: `1000`) |
| `--json` | Output a JSON snapshot and exit |
| `--log <file>` | Stream metrics to a CSV file |
| `--alert-cpu <pct>` | Print alert when CPU exceeds % |
| `--alert-mem <mb>` | Print alert when RSS exceeds MB |

## What it does

Renders a live-updating terminal table of running processes with per-process CPU%, memory%, RSS, VSZ, status, and a 10-char sparkline of CPU history. A system header shows aggregate CPU, RAM usage, uptime, and load averages. Processes can be sorted, filtered by name, navigated with arrow keys, and killed with `k` / `K`. Works on macOS (`ps aux` + `top -l 1`) and Linux (`ps aux` + `/proc/stat`).

---

<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
