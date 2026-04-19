export type AIProvider = 'openai' | 'anthropic' | 'mistral' | 'gemini'

export interface AIModel {
  id: string
  name: string
  provider: AIProvider
}

export interface ProjectSettings {
  id: string
  name: string
  description?: string
  watermarkFilename?: string | null
  ttsUrl: string
  ttsVoice: string
  aiProvider: AIProvider
  aiModel: string
  apiKeys: Record<AIProvider, string>
  createdAt: string
  updatedAt: string
}

export interface SubtitleEntry {
  index: number
  startTime: number
  endTime: number
  text: string
  words?: SubtitleWord[]
}

export interface SubtitleWord {
  text: string
  startTime: number
  endTime: number
}

export interface SubtitleStyle {
  fontSize: number
  textColor: string
  bgColor: string
  bgOpacity: number
  bold: boolean
  position: 'top' | 'center' | 'bottom'
  positionMargin: number  // % of video height from the nearest edge
  highlightActiveWord: boolean
  activeWordColor: string
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 2.5,
  textColor: '#ffffff',
  bgColor: '#2563eb',
  bgOpacity: 100,
  bold: true,
  position: 'bottom',
  positionMargin: 5,
  highlightActiveWord: true,
  activeWordColor: '#facc15',
}

export interface WizardState {
  projectId: string | null
  currentStep: number

  rawText: string

  preparedText: string
  selectedProvider: AIProvider
  selectedModel: string

  audioUrl: string | null
  audioFilename: string | null
  audioDuration: number

  images: UploadedImage[]
  timelineImageIds: string[]

  selectedMusicId: string | null
  musicVolume: number
  enableImageTransitions: boolean
  watermarkFilename: string | null
  watermarkUrl: string | null

  subtitles: SubtitleEntry[]
  subtitleStyle: SubtitleStyle
  speechVolume: number

  exportFormats: VideoFormat[]
  exportProgress: ExportProgress | null
  exportedFiles: ExportResult[]
}

export interface UploadedImage {
  id: string
  filename: string
  url: string
  order: number
}

export interface MusicTrack {
  id: string
  name: string
  artist?: string
  duration: number
  url: string
}

export interface VideoFormat {
  id: string
  name: string
  width: number
  height: number
  description: string
  enabled: boolean
}

export interface ExportProgress {
  stage: string
  percent: number
  message: string
  done: boolean
  error?: string
}

export interface ExportResult {
  format: string
  path: string
  size: number
}

export const AI_MODELS: AIModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral' },
  { id: 'mistral-medium-latest', name: 'Mistral Medium', provider: 'mistral' },
  { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
]

export const DEFAULT_VIDEO_FORMATS: VideoFormat[] = [
  { id: 'story', name: 'Instagram Story', width: 1080, height: 1920, description: '9:16 · Вертикальный', enabled: true },
  { id: 'feed_square', name: 'Instagram Feed', width: 1080, height: 1080, description: '1:1 · Квадратный', enabled: true },
  { id: 'feed_portrait', name: 'Instagram Portrait', width: 1080, height: 1350, description: '4:5 · Портрет', enabled: false },
  { id: 'landscape', name: 'YouTube / Landscape', width: 1920, height: 1080, description: '16:9 · Горизонтальный', enabled: false },
]

export const TTS_VOICES = ['kseniya', 'aidar', 'baya', 'irina', 'ruslan']

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  mistral: 'Mistral AI',
  gemini: 'Google Gemini',
}
