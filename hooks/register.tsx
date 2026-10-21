import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { DayStats, Range, Tab, Usage } from '../types'

const usage = atom({ plugin: 'usage-activity', key: 'usage' } as const, null)
const tab = atom({ plugin: 'usage-activity', key: 'tab' } as const, 'overview')
const range = atom({ plugin: 'usage-activity', key: 'range' } as const, 'all')

const PANE = 'usage-activity'
const HOBBIT_TOKENS = 123_000
const WEEKS = 26
const CELL = 15
const GAP = 3
const MODEL_COLORS = ['#d97757', '#3b82f6', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#94a3b8']

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseKey = (key: string) => new Date(`${key}T12:00:00`)
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)
const dayTokens = (day: DayStats | undefined) =>
  day ? Object.values(day.models).reduce((a, b) => a + b, 0) : 0

const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

const prettyModel = (id: string) => {
  const m = id.match(/^claude-(?:(opus|sonnet|haiku|fable)-)?(\d+)(?:-(\d+))?$/)
  if (m && m[1]) {
    const name = m[1][0].toUpperCase() + m[1].slice(1)
    return `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
  }
  const old = id.match(/^claude-(\d+)(?:-(\d+))?-(opus|sonnet|haiku)/)
  if (old) return `${old[3][0].toUpperCase()}${old[3].slice(1)} ${old[1]}${old[2] ? `.${old[2]}` : ''}`
  return id
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`

const inRange = (usageData: Usage, r: Range) => {
  const today = parseKey(usageData.today)
  const from = r === 'all' ? '' : keyOf(addDays(today, r === '7d' ? -6 : -29))
  return Object.keys(usageData.days)
    .filter(k => k >= from)
    .sort()
}

const summarize = (data: Usage, r: Range) => {
  const keys = inRange(data, r)
  const models: Record<string, number> = {}
  const hours: Record<string, number> = {}
  let sessions = 0
  let messages = 0
  let activeDays = 0
  for (const k of keys) {
    const day = data.days[k]
    sessions += day.sessions
    messages += day.messages
    if (day.messages > 0) activeDays += 1
    for (const [m, t] of Object.entries(day.models)) models[m] = (models[m] ?? 0) + t
    for (const [h, c] of Object.entries(day.hours)) hours[h] = (hours[h] ?? 0) + c
  }
  const total = Object.values(models).reduce((a, b) => a + b, 0)
  const favorite = Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0]
  const peak = Object.entries(hours).sort((a, b) => b[1] - a[1])[0]?.[0]
  return { sessions, messages, activeDays, total, models, favorite, peak }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const FONT = "font-family=\"system-ui,-apple-system,'Segoe UI',sans-serif\""

const tile = (x: number, y: number, w: number, label: string, value: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="50" rx="6" fill="#363636" stroke="#444" stroke-width="1"/>` +
  `<text x="${x + 10}" y="${y + 20}" ${FONT} font-size="12" fill="#b4b4b4">${esc(label)}</text>` +
  `<text x="${x + 10}" y="${y + 40}" ${FONT} font-size="15" font-weight="700" fill="#f2f2f2">${esc(value)}</text>`

const heatLevel = (v: number, max: number) => {
  if (v <= 0) return '#2f2f2f'
  const r = v / max
  if (r < 0.25) return '#1e3a72'
  if (r < 0.5) return '#2150a6'
  if (r < 0.75) return '#2563eb'
  return '#4f8cff'
}

const overviewSvg = (data: Usage, r: Range, width: number) => {
  const s = summarize(data, r)
  const tw = Math.floor((width - 24 - 16) / 3)
  const stats: [string, string][] = [
    ['Sessions', s.sessions.toLocaleString('en-US')],
    ['Messages', s.messages.toLocaleString('en-US')],
    ['Total tokens', compact(s.total)],
    ['Active days', String(s.activeDays)],
    ['Peak hour', s.peak === undefined ? '-' : hourLabel(Number(s.peak))],
    ['Favorite model', s.favorite ? prettyModel(s.favorite) : '-'],
  ]
  let body = ''
  stats.forEach(([label, value], i) => {
    body += tile(12 + (i % 3) * (tw + 8), 12 + Math.floor(i / 3) * 58, tw, label, value)
  })

  const today = parseKey(data.today)
  const todayRow = today.getDay()
  const start = addDays(today, -(todayRow + (WEEKS - 1) * 7))
  const max = Math.max(1, ...Object.values(data.days).map(dayTokens))
  const gx = 12
  const gy = 12 + 116 + 8
  const cell = Math.min(CELL, Math.floor((width - 24 - (WEEKS - 1) * GAP) / WEEKS))
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      const key = keyOf(date)
      if (key > data.today) continue
      const v = dayTokens(data.days[key])
      body += `<rect x="${gx + w * (cell + GAP)}" y="${gy + d * (cell + GAP)}" width="${cell}" height="${cell}" rx="3" fill="${heatLevel(v, max)}"><title>${key}: ${compact(v)} tokens</title></rect>`
    }
  }
  const gridH = 7 * cell + 6 * GAP
  const ratio = Math.round(s.total / HOBBIT_TOKENS)
  const footY = gy + gridH + 24
  body += `<text x="12" y="${footY}" ${FONT} font-size="12" fill="#a8a8a8">You've used ~${ratio.toLocaleString('en-US')}× more tokens than The Hobbit.</text>`
  return { svg: wrap(width, footY + 14, body), height: footY + 14 }
}

const modelsSvg = (data: Usage, r: Range, width: number) => {
  const today = parseKey(data.today)
  const keys = inRange(data, r)
  const first = keys.length > 0 ? parseKey(keys[0]) : today
  const spanDays = r === '7d' ? 7 : r === '30d' ? 30 : Math.max(1, Math.round((+today - +first) / 864e5) + 1)
  const stepDays = spanDays > 60 ? 7 : 1
  const columns: Record<string, number>[] = []
  for (let off = spanDays - 1; off >= 0; off -= stepDays) {
    const col: Record<string, number> = {}
    for (let i = 0; i < stepDays && off - i >= 0; i++) {
      const day = data.days[keyOf(addDays(today, -(off - i)))]
      if (!day) continue
      for (const [m, t] of Object.entries(day.models)) col[m] = (col[m] ?? 0) + t
    }
    columns.push(col)
  }
  const totals: Record<string, number> = {}
  for (const col of columns) for (const [m, t] of Object.entries(col)) totals[m] = (totals[m] ?? 0) + t
  const order = Object.keys(totals).sort((a, b) => totals[b] - totals[a])
  const color = (m: string) => MODEL_COLORS[order.indexOf(m) % MODEL_COLORS.length]
  const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1
  const chartH = 150
  const colMax = Math.max(1, ...columns.map(c => Object.values(c).reduce((a, b) => a + b, 0)))
  const cw = Math.max(3, Math.floor((width - 24) / columns.length))
  const bw = Math.max(2, cw - Math.min(3, Math.round(cw * 0.2)))
  let body = ''
  for (let i = 1; i <= 3; i++) {
    const y = 12 + chartH - (chartH * i) / 3
    body += `<line x1="12" x2="${width - 12}" y1="${y}" y2="${y}" stroke="#333" stroke-width="1"/>`
  }
  columns.forEach((col, i) => {
    let y = 12 + chartH
    for (const m of order) {
      const t = col[m]
      if (!t) continue
      const h = Math.max(1, (t / colMax) * chartH)
      y -= h
      body += `<rect x="${12 + i * cw}" y="${y}" width="${bw}" height="${h}" rx="${Math.min(2, bw / 2)}" fill="${color(m)}"><title>${esc(prettyModel(m))}: ${compact(t)}</title></rect>`
    }
  })
  let ly = 12 + chartH + 24
  order.slice(0, 6).forEach((m, i) => {
    const x = 12 + (i % 2) * Math.floor((width - 24) / 2)
    const y = ly + Math.floor(i / 2) * 20
    body += `<rect x="${x}" y="${y - 10}" width="10" height="10" rx="3" fill="${color(m)}"/>`
    body += `<text x="${x + 18}" y="${y}" ${FONT} font-size="12" fill="#d0d0d0">${esc(prettyModel(m))}</text>`
    body += `<text x="${x + Math.floor((width - 24) / 2) - 16}" y="${y}" ${FONT} font-size="12" fill="#9a9a9a" text-anchor="end">${Math.round((totals[m] / grand) * 100)}% · ${compact(totals[m])}</text>`
  })
  const height = ly + Math.ceil(Math.min(order.length, 6) / 2) * 20 + 4
  return { svg: wrap(width, height, body), height }
}

const wrap = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
  `<rect width="${width}" height="${height}" rx="10" fill="#252525"/>${body}</svg>`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'usage-activity',
      description: 'Show the usage activity panel',
    })
    void $.ui.open({ id: PANE, title: 'Activity' })
    void (async () => {
      const ran = await $.process.run(['python3', `${$.plugin.root}/hooks/usage.py`], { timeoutMs: 120_000 }).catch(() =>
        $.process.run(['python', `${$.plugin.root}/hooks/usage.py`], { timeoutMs: 120_000 }),
      )
      if (ran.exitCode === 0) {
        const parsed = JSON.parse(ran.stdout) as Usage
        await update($, usage, () => parsed)
      }
    })().catch(() => undefined)

    return started
  })

  on('command.run', { command: 'usage-activity' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Activity' })

    return { text: 'Activity panel opened.' }
  })

  // The panel belongs to the empty chat: it goes away with the first prompt.
  on('prompt.submit', async ($, e, next) => {
    void $.ui.close({ id: PANE }).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const data = await read($, usage)
    const current = (await read($, tab)) as Tab
    const r = (await read($, range)) as Range
    const width = Math.min(380, Math.max(280, Math.floor(e.props.bodyColumns * 8)))

    const tabBtn = (id: Tab, label: string) => (
      <Button
        key={`tab-${id}`}
        label={label}
        variant={current === id ? 'primary' : 'secondary'}
        onPress={() => update($, tab, () => id)}
      />
    )
    const rangeBtn = (id: Range, label: string) => (
      <Button
        key={`range-${id}`}
        label={label}
        variant={r === id ? 'primary' : 'secondary'}
        onPress={() => update($, range, () => id)}
      />
    )

    const drawn = data ? (current === 'overview' ? overviewSvg(data, r, width) : modelsSvg(data, r, width)) : null

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            {tabBtn('overview', 'Overview')}
            {tabBtn('models', 'Models')}
          </Box>
          <Box flexDirection="row" gap={1}>
            {rangeBtn('all', 'All')}
            {rangeBtn('30d', '30d')}
            {rangeBtn('7d', '7d')}
          </Box>
        </Box>
        {drawn ? (
          <Svg source={drawn.svg} alt="Claude usage activity" width={width} height={drawn.height} isInteractive />
        ) : (
          <Text dimColor>Reading local usage…</Text>
        )}
      </Box>
    )
  })
}
