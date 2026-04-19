import { create } from 'zustand'
import type { WizardState, UploadedImage, SubtitleEntry, SubtitleStyle, VideoFormat, ExportProgress, ExportResult, AIProvider } from '../types'
import { DEFAULT_VIDEO_FORMATS, DEFAULT_SUBTITLE_STYLE } from '../types'
import { projectsApi, BASE_URL } from '../lib/api'
import { normalizeSubtitleEntry } from '../lib/subtitles'

interface WizardActions {
  setProject: (id: string) => void
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setRawText: (t: string) => void
  setPreparedText: (t: string) => void
  setProvider: (p: AIProvider) => void
  setModel: (m: string) => void
  setAudio: (url: string, filename: string, duration: number) => void
  setImages: (imgs: UploadedImage[]) => void
  addImages: (imgs: UploadedImage[]) => void
  reorderImages: (imgs: UploadedImage[]) => void
  removeImage: (id: string) => void
  setTimelineImageIds: (ids: string[]) => void
  setTimelineHasSpeech: (enabled: boolean) => void
  setTimelineHasMusic: (enabled: boolean) => void
  setTimelineHasSubtitles: (enabled: boolean) => void
  setMusic: (id: string | null) => void
  setMusicVolume: (v: number) => void
  setEnableImageTransitions: (enabled: boolean) => void
  setWatermark: (filename: string | null, url: string | null) => void
  setSubtitles: (subs: SubtitleEntry[]) => void
  updateSubtitle: (index: number, text: string) => void
  removeSubtitle: (index: number) => void
  setSubtitleStyle: (style: Partial<SubtitleStyle>) => void
  setSpeechVolume: (v: number) => void
  setExportFormats: (formats: VideoFormat[]) => void
  toggleFormat: (id: string) => void
  setExportProgress: (p: ExportProgress | null) => void
  setExportedFiles: (files: ExportResult[]) => void
  setPreviewFormatId: (id: WizardState['previewFormatId']) => void
  setPreviewVideo: (filename: string | null, url: string | null) => void
  restoreState: (projectId: string, data: Record<string, unknown>) => void
  reset: () => void
}

const initialState: WizardState = {
  projectId: null,
  currentStep: 1,
  rawText: '',
  preparedText: '',
  selectedProvider: 'mistral',
  selectedModel: 'mistral-large-latest',
  audioUrl: null,
  audioFilename: null,
  audioDuration: 0,
  images: [],
  timelineImageIds: [],
  timelineHasSpeech: true,
  timelineHasMusic: true,
  timelineHasSubtitles: true,
  selectedMusicId: null,
  musicVolume: 30,
  enableImageTransitions: true,
  watermarkFilename: null,
  watermarkUrl: null,
  subtitles: [],
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  speechVolume: 100,
  exportFormats: DEFAULT_VIDEO_FORMATS,
  exportProgress: null,
  exportedFiles: [],
  previewFormatId: '9:16',
  previewVideoFilename: null,
  previewVideoUrl: null,
}

export const useWizardStore = create<WizardState & WizardActions>((set) => ({
  ...initialState,
  setProject: (id) => set({ projectId: id }),
  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 8) })),
  prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),
  setRawText: (t) => set({ rawText: t }),
  setPreparedText: (t) => set({ preparedText: t }),
  setProvider: (p) => set({ selectedProvider: p }),
  setModel: (m) => set({ selectedModel: m }),
  setAudio: (url, filename, duration) => set({ audioUrl: url, audioFilename: filename, audioDuration: duration }),
  setImages: (imgs) => set({ images: imgs }),
  addImages: (imgs) => set((s) => {
    const merged = [...s.images]
    for (const img of imgs) {
      const existingIndex = merged.findIndex(existing => existing.id === img.id)
      if (existingIndex >= 0) {
        merged[existingIndex] = { ...merged[existingIndex], ...img, order: merged[existingIndex].order }
      } else {
        merged.push(img)
      }
    }
    return { images: merged.sort((a, b) => a.order - b.order) }
  }),
  reorderImages: (imgs) => set({ images: imgs }),
  removeImage: (id) => set((s) => ({ images: s.images.filter(i => i.id !== id) })),
  setTimelineImageIds: (ids) => set({ timelineImageIds: ids }),
  setTimelineHasSpeech: (enabled) => set({ timelineHasSpeech: enabled }),
  setTimelineHasMusic: (enabled) => set({ timelineHasMusic: enabled }),
  setTimelineHasSubtitles: (enabled) => set({ timelineHasSubtitles: enabled }),
  setMusic: (id) => set({ selectedMusicId: id }),
  setMusicVolume: (v) => set({ musicVolume: v }),
  setEnableImageTransitions: (enabled) => set({ enableImageTransitions: enabled }),
  setWatermark: (filename, url) => set({ watermarkFilename: filename, watermarkUrl: url }),
  setSubtitles: (subs) => set({ subtitles: subs.map(normalizeSubtitleEntry) }),
  updateSubtitle: (index, text) =>
    set((s) => ({
      subtitles: s.subtitles.map(sub => sub.index === index ? normalizeSubtitleEntry({ ...sub, text }) : sub),
    })),
  removeSubtitle: (index) =>
    set((s) => ({
      subtitles: s.subtitles.filter(sub => sub.index !== index),
    })),
  setSubtitleStyle: (style) => set((s) => ({ subtitleStyle: { ...s.subtitleStyle, ...style } })),
  setSpeechVolume: (v) => set({ speechVolume: v }),
  setExportFormats: (formats) => set({ exportFormats: formats }),
  toggleFormat: (id) =>
    set((s) => ({
      exportFormats: s.exportFormats.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f),
    })),
  setExportProgress: (p) => set({ exportProgress: p }),
  setExportedFiles: (files) => set({ exportedFiles: files }),
  setPreviewFormatId: (id) => set({ previewFormatId: id }),
  setPreviewVideo: (filename, url) => set({ previewVideoFilename: filename, previewVideoUrl: url }),
  restoreState: (projectId, data) => set({
    projectId,
    currentStep: (data.wizardStep as number) ?? 1,
    rawText: (data.rawText as string) ?? '',
    preparedText: (data.preparedText as string) ?? '',
    selectedProvider: (data.selectedProvider as AIProvider) ?? initialState.selectedProvider,
    selectedModel: (data.selectedModel as string) ?? initialState.selectedModel,
    audioUrl: data.audioFilename
      ? `${BASE_URL}/media/audio/${projectId}/${data.audioFilename}`
      : null,
    audioFilename: (data.audioFilename as string) ?? null,
    audioDuration: (data.audioDuration as number) ?? 0,
    images: ((data.images ?? []) as Array<{ id: string; filename: string; order: number }>).map(img => ({
      ...img,
      url: `${BASE_URL}/media/images/${projectId}/${img.filename}`,
    })),
    timelineImageIds: (() => {
      const imgs = ((data.images ?? []) as Array<{ id: string }>).map(i => i.id)
      const stored = data.timelineImageIds as string[] | undefined
      return stored?.length ? stored.filter(id => imgs.includes(id)) : imgs
    })(),
    timelineHasSpeech: (data.timelineHasSpeech as boolean) ?? true,
    timelineHasMusic: (data.timelineHasMusic as boolean) ?? true,
    timelineHasSubtitles: (data.timelineHasSubtitles as boolean) ?? true,
    selectedMusicId: (data.selectedMusicId as string) ?? null,
    musicVolume: (data.musicVolume as number) ?? 30,
    enableImageTransitions: (data.enableImageTransitions as boolean) ?? true,
    watermarkFilename: (data.watermarkFilename as string) ?? null,
    watermarkUrl: data.watermarkFilename
      ? `${BASE_URL}/media/watermark/${projectId}/${data.watermarkFilename as string}`
      : null,
    subtitles: ((data.subtitles as SubtitleEntry[]) ?? []).map(normalizeSubtitleEntry),
    subtitleStyle: data.subtitleStyle
      ? { ...DEFAULT_SUBTITLE_STYLE, ...(data.subtitleStyle as SubtitleStyle) }
      : DEFAULT_SUBTITLE_STYLE,
    speechVolume: (data.speechVolume as number) ?? 100,
    exportFormats: (data.exportFormats as VideoFormat[]) ?? DEFAULT_VIDEO_FORMATS,
    exportProgress: null,
    exportedFiles: [],
    previewFormatId: (data.previewFormatId as WizardState['previewFormatId']) ?? '9:16',
    previewVideoFilename: (data.previewVideoFilename as string) ?? null,
    previewVideoUrl: data.previewVideoFilename
      ? `${BASE_URL}/media/video/${projectId}/${data.previewVideoFilename as string}`
      : null,
  }),
  reset: () => set(initialState),
}))

// Auto-save wizard state to backend with 1.5s debounce
let _saveTimer: ReturnType<typeof setTimeout> | null = null

useWizardStore.subscribe((state) => {
  if (!state.projectId) return
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    const s = useWizardStore.getState()
    if (!s.projectId) return
    projectsApi.update(s.projectId, {
      data: {
        wizardStep: s.currentStep,
        rawText: s.rawText,
        preparedText: s.preparedText,
        selectedProvider: s.selectedProvider,
        selectedModel: s.selectedModel,
        audioFilename: s.audioFilename,
        audioDuration: s.audioDuration,
        images: s.images.map(({ id, filename, order }) => ({ id, filename, order })),
        timelineImageIds: s.timelineImageIds,
        timelineHasSpeech: s.timelineHasSpeech,
        timelineHasMusic: s.timelineHasMusic,
        timelineHasSubtitles: s.timelineHasSubtitles,
        selectedMusicId: s.selectedMusicId,
        musicVolume: s.musicVolume,
        enableImageTransitions: s.enableImageTransitions,
        watermarkFilename: s.watermarkFilename,
        subtitles: s.subtitles,
        subtitleStyle: s.subtitleStyle,
        speechVolume: s.speechVolume,
        exportFormats: s.exportFormats,
        previewFormatId: s.previewFormatId,
        previewVideoFilename: s.previewVideoFilename,
      },
    }).catch(() => {})
  }, 1500)
})
