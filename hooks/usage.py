#!/usr/bin/env python3
"""Aggregate local Claude Code transcripts into per-day usage stats (JSON on stdout)."""
import glob
import json
import os
import sys
from datetime import datetime

root = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")
days = {}
seen = set()


def day_of(stamp):
    try:
        t = datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone()
    except (ValueError, AttributeError):
        return None, None
    return t.strftime("%Y-%m-%d"), t.hour


def bucket(key):
    return days.setdefault(key, {"models": {}, "messages": 0, "sessions": 0, "hours": {}})


for path in glob.glob(os.path.join(root, "projects", "*", "*.jsonl")):
    first = None
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if '"type":"assistant"' not in line and '"type":"user"' not in line:
                    continue
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                msg = row.get("message")
                if row.get("type") not in ("assistant", "user") or not isinstance(msg, dict):
                    continue
                key, hour = day_of(row.get("timestamp"))
                if key is None:
                    continue
                if first is None:
                    first = key
                uid = (msg.get("id"), row.get("requestId")) if msg.get("id") else None
                if uid is not None:
                    if uid in seen:
                        continue
                    seen.add(uid)
                day = bucket(key)
                day["messages"] += 1
                day["hours"][str(hour)] = day["hours"].get(str(hour), 0) + 1
                usage = msg.get("usage")
                model = msg.get("model")
                if row.get("type") == "assistant" and isinstance(usage, dict) and model and model != "<synthetic>":
                    total = sum(
                        usage.get(k) or 0
                        for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
                    )
                    day["models"][model] = day["models"].get(model, 0) + total
    except OSError:
        continue
    if first is not None:
        bucket(first)["sessions"] += 1

json.dump({"days": days, "today": datetime.now().strftime("%Y-%m-%d")}, sys.stdout)
