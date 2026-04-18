import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider } from '../types'

interface GlobalSettings {
  apiKeys: Record<AIProvider, string>
  defaultProvider: AIProvider
  defaultModel: string
  ttsVoice: string
  defaultWatermark: string
}

interface SettingsStore extends GlobalSettings {
  setApiKey: (provider: AIProvider, key: string) => void
  setDefaultProvider: (p: AIProvider) => void
  setDefaultModel: (m: string) => void
  setTtsVoice: (v: string) => void
  setDefaultWatermark: (w: string) => void
  loadFromServer: (data: Partial<GlobalSettings>) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      apiKeys: { openai: '', anthropic: '', mistral: '', gemini: '' },
      defaultProvider: 'mistral',
      defaultModel: 'mistral-large-latest',
      ttsVoice: 'kseniya',
      defaultWatermark: '',
      setApiKey: (provider, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setDefaultProvider: (p) => set({ defaultProvider: p }),
      setDefaultModel: (m) => set({ defaultModel: m }),
      setTtsVoice: (v) => set({ ttsVoice: v }),
      setDefaultWatermark: (w) => set({ defaultWatermark: w }),
      loadFromServer: (data) => set((s) => ({ ...s, ...data })),
    }),
    { name: 'clip-studio-settings' }
  )
)
