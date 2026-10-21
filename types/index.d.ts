export type DayStats = {
  /** Tokens per model id: input + output + cache creation + cache reads */
  models: Record<string, number>
  messages: number
  sessions: number
  /** Message count per local hour of day, "0".."23" */
  hours: Record<string, number>
}

export type Usage = { days: Record<string, DayStats>; today: string }

export type Tab = 'overview' | 'models'
export type Range = 'all' | '30d' | '7d'

declare module 'claude-code' {
  interface PluginState {
    'usage-activity': {
      usage: Usage | null
      tab: Tab
      range: Range
    }
  }
}
