# Command reference

Use `node index.js` from the pinned source checkout described in the [README](../README.md). The entries below describe the inspected implementation.

| Command or argument | Behavior |
| --- | --- |
| `--pid N` | Restrict monitoring to one PID. |
| `--name PATTERN` | Filter process names. |
| `--watch COMMAND` | Spawn a command and monitor it. |
| `--interval MS` | Set refresh interval; defaults to 1000. |
| `--sort COLUMN` | Sort by cpu, mem, pid or name. |
| `--limit N` | Limit the number of displayed processes. |
| `--json` | Print one snapshot as JSON and exit. |
| `--log FILE` | Append metric samples to a CSV file. |
| `--alert-cpu PERCENT` | Alert above a CPU threshold. |
| `--alert-mem MB` | Alert above a memory threshold. |
| `k / K in TUI` | Send SIGTERM / SIGKILL to the selected process. |

For prerequisites, file writes, external services and known limitations, see [Behavior and limits](../README.md#behavior-and-limits).

Implementation: [index.js](https://github.com/NickCirv/process-monitor/blob/ce7361d99ebe70631787c95712effd1aa83756a7/index.js); [review evidence](RESEARCH.md).
