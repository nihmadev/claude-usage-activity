# usage-activity

A Claude Code mod that brings back the activity panel on a new chat: sessions, messages,
total tokens, active days, peak hour, favorite model, a heatmap of the last 26 weeks, and a
stacked per-model chart. Filter by All / 30d / 7d.

It works only in Claude Code Desktop (it draws an SVG, which the terminal cannot).

## Install

At the prompt of a terminal session:

```
/plugin install usage-activity --marketplace nihmadev/claude-usage-activity
```

From a shell:

```
claude plugin install usage-activity --marketplace nihmadev/claude-usage-activity
```

## How it works

- On session start it opens a side pane; the first prompt closes it. `/usage-activity` reopens it.
- Numbers come from your local transcripts in `~/.claude/projects/*/*.jsonl`
  (or `$CLAUDE_CONFIG_DIR/projects`), aggregated by `hooks/usage.py`. Nothing leaves your machine.
- Tokens = input + output + cache creation + cache reads, per assistant message.
- Sessions, messages and days are counted from files that exist on this machine, so they can
  differ from what Anthropic shows.

## Requirements

`python3` (or `python`) on PATH.
