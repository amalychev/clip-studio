import { useEffect, useRef, useState, useCallback } from 'react'
import { clsx } from 'clsx'
import { useWizardStore } from '../../stores/wizardStore'
import { BASE_URL, videoApi } from '../../lib/api'
import type { SubtitleEntry, SubtitleStyle, UploadedImage } from '../../types'
import { getActiveSubtitleWordIndex, splitSubtitleTokens } from '../../lib/subtitles'
import {
  Play, Pause, SkipBack, ArrowLeft, ArrowRight, Volume2,
  AlignLeft, AlignCenter, AlignRight, X, Music, Mic, FileText, Loader2,
} from 'lucide-react'
import { Button } from '../ui/Button'

// ─── Constants ────────────────────────────────────────────────────────────────

const PX_PER_SEC = 72
const TRACK_H = 34
const RULER_H = 22
const LEAD_IN = 2
const LEAD_OUT = 2
const SUBTITLE_ADVANCE = 0
const TIMELINE_LABEL_W = 96
const DT_IMG = 'cs-image-id'   // dataTransfer key for images

const FORMATS = [
  { id: '9:16', label: '9:16', w: 9, h: 16, width: 1080, height: 1920 },
  { id: '1:1',  label: '1:1',  w: 1, h: 1,  width: 1080, height: 1080 },
  { id: '4:5',  label: '4:5',  w: 4, h: 5,  width: 1080, height: 1350 },
  { id: '16:9', label: '16:9', w: 16, h: 9, width: 1920, height: 1080 },
] as const
type FormatId = typeof FORMATS[number]['id']

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

// ─── Assets Panel ─────────────────────────────────────────────────────────────

function AssetsPanel({ images, audioUrl, audioDuration, selectedMusicId, subtitles }: {
  images: UploadedImage[]
  audioUrl: string | null
  audioDuration: number
  selectedMusicId: string | null
  subtitles: SubtitleEntry[]
}) {
  const musicName = selectedMusicId
    ? selectedMusicId.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    : null

  return (
    <div className="bg-surface-1 border border-border rounded-xl p-3 h-full overflow-y-auto flex flex-col gap-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider shrink-0">Ассеты</p>

      {/* Images */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted/60 uppercase tracking-wider">
          Изображения {images.length > 0 && `(${images.length})`}
        </span>
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {images.map((img, idx) => (
              <div
                key={img.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData(DT_IMG, img.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="relative group w-9 h-9 rounded overflow-hidden border border-border cursor-grab hover:border-accent transition-colors shrink-0"
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <span className="text-white font-bold" style={{ fontSize: 9 }}>{idx + 1}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted/40 italic">Нет изображений</span>
        )}
      </div>

      {/* TTS */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted/60 uppercase tracking-wider">Озвучка</span>
        {audioUrl ? (
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('cs-type', 'tts'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-lg px-2 py-1.5 cursor-grab"
          >
            <Mic size={11} className="text-accent shrink-0" />
            <span className="text-xs text-accent truncate">TTS · {fmtTime(audioDuration)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted/40 italic">Нет озвучки</span>
        )}
      </div>

      {/* Music */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted/60 uppercase tracking-wider">Фоновый звук</span>
        {selectedMusicId ? (
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('cs-type', 'music'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1.5 cursor-grab"
          >
            <Music size={11} className="text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-400 truncate capitalize">{musicName}</span>
          </div>
        ) : (
          <span className="text-xs text-muted/40 italic">Нет музыки</span>
        )}
      </div>

      {/* Subtitles */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted/60 uppercase tracking-wider">Субтитры</span>
        {subtitles.length > 0 ? (
          <div
            draggable
            onDragStart={e => { e.dataTransfer.setData('cs-type', 'subtitles'); e.dataTransfer.effectAllowed = 'move' }}
            className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5 cursor-grab"
          >
            <FileText size={11} className="text-amber-400 shrink-0" />
            <span className="text-xs text-amber-400 truncate">{subtitles.length} строк</span>
          </div>
        ) : (
          <span className="text-xs text-muted/40 italic">Нет субтитров</span>
        )}
      </div>
    </div>
  )
}

// ─── Subtitle Style Editor ────────────────────────────────────────────────────

function StyleEditor({
  style,
  onChange,
  disabled = false,
}: {
  style: SubtitleStyle
  onChange: (p: Partial<SubtitleStyle>) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState({
    fontSize: style.fontSize,
    lineSpacing: style.lineSpacing ?? 130,
    borderRadius: style.borderRadius ?? 0,
    bgOpacity: style.bgOpacity,
    positionMargin: style.positionMargin,
    textColor: style.textColor,
    bgColor: style.bgColor,
    activeWordColor: style.activeWordColor,
  })

  useEffect(() => {
    setDraft({
      fontSize: style.fontSize,
      lineSpacing: style.lineSpacing ?? 130,
      borderRadius: style.borderRadius ?? 0,
      bgOpacity: style.bgOpacity,
      positionMargin: style.positionMargin,
      textColor: style.textColor,
      bgColor: style.bgColor,
      activeWordColor: style.activeWordColor,
    })
  }, [style.fontSize, style.lineSpacing, style.borderRadius, style.bgOpacity, style.positionMargin, style.textColor, style.bgColor, style.activeWordColor])

  return (
    <div
      className={clsx(
        'bg-surface-1 border border-border rounded-xl p-3 h-full overflow-y-auto flex flex-col gap-3 transition-opacity',
        disabled && 'opacity-45 pointer-events-none select-none'
      )}
      aria-disabled={disabled}
    >
      <p className="text-xs font-semibold text-muted uppercase tracking-wider shrink-0">Стиль субтитров</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="w-full">
          <label className="text-xs text-muted">Размер {draft.fontSize}%</label>
          <input type="range" min={1} max={15} step={0.5} value={draft.fontSize}
            onChange={e => setDraft(prev => ({ ...prev, fontSize: +e.target.value }))}
            onMouseUp={() => onChange({ fontSize: draft.fontSize })}
            onTouchEnd={() => onChange({ fontSize: draft.fontSize })}
            onKeyUp={() => onChange({ fontSize: draft.fontSize })}
            onBlur={() => onChange({ fontSize: draft.fontSize })}
            className="w-full accent-accent h-1.5 cursor-pointer mt-2" />
        </div>
        <div className="w-full">
          <label className="text-xs text-muted">Интервал {draft.lineSpacing}%</label>
          <input type="range" min={100} max={250} step={5} value={draft.lineSpacing}
            onChange={e => setDraft(prev => ({ ...prev, lineSpacing: +e.target.value }))}
            onMouseUp={() => onChange({ lineSpacing: draft.lineSpacing })}
            onTouchEnd={() => onChange({ lineSpacing: draft.lineSpacing })}
            onKeyUp={() => onChange({ lineSpacing: draft.lineSpacing })}
            onBlur={() => onChange({ lineSpacing: draft.lineSpacing })}
            className="w-full accent-accent h-1.5 cursor-pointer mt-2" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="w-full">
          <label className="text-xs text-muted">Прозрачность {draft.bgOpacity}%</label>
          <input type="range" min={0} max={100} value={draft.bgOpacity}
            onChange={e => setDraft(prev => ({ ...prev, bgOpacity: +e.target.value }))}
            onMouseUp={() => onChange({ bgOpacity: draft.bgOpacity })}
            onTouchEnd={() => onChange({ bgOpacity: draft.bgOpacity })}
            onKeyUp={() => onChange({ bgOpacity: draft.bgOpacity })}
            onBlur={() => onChange({ bgOpacity: draft.bgOpacity })}
            className="w-full accent-accent h-1.5 cursor-pointer mt-2" />
        </div>
        <div className="w-full">
          <label className="text-xs text-muted">Закругление {draft.borderRadius}%</label>
          <input type="range" min={0} max={50} step={5} value={draft.borderRadius}
            onChange={e => setDraft(prev => ({ ...prev, borderRadius: +e.target.value }))}
            onMouseUp={() => onChange({ borderRadius: draft.borderRadius })}
            onTouchEnd={() => onChange({ borderRadius: draft.borderRadius })}
            onKeyUp={() => onChange({ borderRadius: draft.borderRadius })}
            onBlur={() => onChange({ borderRadius: draft.borderRadius })}
            className="w-full accent-accent h-1.5 cursor-pointer mt-2" />
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 flex flex-col gap-2">
          <label className="text-xs text-muted">Цвет текста</label>
          <div className="flex items-center gap-2">
            <input type="color" value={draft.textColor}
              onChange={e => setDraft(prev => ({ ...prev, textColor: e.target.value }))}
              onBlur={() => onChange({ textColor: draft.textColor })}
              onMouseUp={() => onChange({ textColor: draft.textColor })}
              className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent p-0.5" />
            <span className="text-xs text-muted font-mono">{draft.textColor}</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <label className="text-xs text-muted">Цвет фона</label>
          <div className="flex items-center gap-2">
            <input type="color" value={draft.bgColor}
              onChange={e => setDraft(prev => ({ ...prev, bgColor: e.target.value }))}
              onBlur={() => onChange({ bgColor: draft.bgColor })}
              onMouseUp={() => onChange({ bgColor: draft.bgColor })}
              className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent p-0.5" />
            <span className="text-xs text-muted font-mono">{draft.bgColor}</span>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={style.highlightActiveWord}
          onChange={e => onChange({ highlightActiveWord: e.target.checked })}
          className="accent-accent"
        />
        Подсвечивать активное слово
      </label>

      {style.highlightActiveWord && (
        <div className="flex-1 flex flex-col gap-2">
          <label className="text-xs text-muted">Цвет активного слова</label>
          <div className="flex items-center gap-2">
            <input type="color" value={draft.activeWordColor}
              onChange={e => setDraft(prev => ({ ...prev, activeWordColor: e.target.value }))}
              onBlur={() => onChange({ activeWordColor: draft.activeWordColor })}
              onMouseUp={() => onChange({ activeWordColor: draft.activeWordColor })}
              className="w-8 h-7 rounded cursor-pointer border border-border bg-transparent p-0.5" />
            <span className="text-xs text-muted font-mono">{draft.activeWordColor}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-xs text-muted">Позиция</label>
        <div className="flex gap-1">
          {(['top', 'center', 'bottom'] as const).map(pos => (
            <button key={pos} onClick={() => onChange({ position: pos })}
              className={clsx(
                'flex-1 py-1.5 rounded-lg border text-xs transition-colors flex items-center justify-center gap-1',
                style.position === pos ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-white'
              )}>
              {pos === 'top' && <AlignLeft size={11} className="rotate-90" />}
              {pos === 'center' && <AlignCenter size={11} />}
              {pos === 'bottom' && <AlignRight size={11} className="rotate-90" />}
              {{ top: 'Верх', center: 'Центр', bottom: 'Низ' }[pos]}
            </button>
          ))}
        </div>
      </div>

      {style.position !== 'center' && (
        <div className="w-full">
          <label className="text-xs text-muted">Отступ от края {draft.positionMargin}%</label>
          <input type="range" min={0} max={30} step={0.5} value={draft.positionMargin}
            onChange={e => setDraft(prev => ({ ...prev, positionMargin: +e.target.value }))}
            onMouseUp={() => onChange({ positionMargin: draft.positionMargin })}
            onTouchEnd={() => onChange({ positionMargin: draft.positionMargin })}
            onKeyUp={() => onChange({ positionMargin: draft.positionMargin })}
            onBlur={() => onChange({ positionMargin: draft.positionMargin })}
            className="w-full accent-accent h-1.5 cursor-pointer mt-2" />
        </div>
      )}
    </div>
  )
}

function getTransitionDuration(imageDuration: number) {
  const duration = Math.min(0.45, imageDuration * 0.35)
  return duration >= 0.12 ? duration : 0
}

// ─── Preview Canvas ───────────────────────────────────────────────────────────
// Owns its outer container (flex-1). Uses ResizeObserver to compute the
// correct pixel dimensions for the selected aspect ratio.

function PreviewCanvas({ imageUrl, nextImageUrl, transitionProgress, edgeBlurProgress, transitionsEnabled, watermarkUrl, subtitle, subtitleTime, style, formatId }: {
  imageUrl: string | null
  nextImageUrl: string | null
  transitionProgress: number
  edgeBlurProgress: number
  transitionsEnabled: boolean
  watermarkUrl: string | null
  subtitle: SubtitleEntry | null
  subtitleTime: number
  style: SubtitleStyle
  formatId: FormatId
}) {
  const f = FORMATS.find(x => x.id === formatId)!
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const calc = () => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      const ratio = f.w / f.h
      const w = cw / ch > ratio ? ch * ratio : cw
      const h = cw / ch > ratio ? ch : cw / ratio
      setBox({ w, h })
    }
    calc()
    const obs = new ResizeObserver(calc)
    obs.observe(el)
    return () => obs.disconnect()
  }, [f.w, f.h])

  const margin = `${style.positionMargin ?? 5}%`
  const activeWordIndex = style.highlightActiveWord ? getActiveSubtitleWordIndex(subtitle, subtitleTime) : -1
  const subtitleTokens = subtitle ? splitSubtitleTokens(subtitle.text) : []
  const fontSizePx = box.h * style.fontSize / 100
  const lineHeightPx = fontSizePx * ((style.lineSpacing ?? 130) / 100)
  const currentFrameBlur = Math.max(
    transitionsEnabled && nextImageUrl ? transitionProgress * 10 : 0,
    edgeBlurProgress * 12,
  )
  const nextFrameBlur = transitionsEnabled && nextImageUrl
    ? Math.max((1 - transitionProgress) * 10, edgeBlurProgress * 12)
    : 0
  const subtitlePos = {
    top:    { top: margin, bottom: 'auto', transform: 'none' },
    center: { top: '50%', bottom: 'auto', transform: 'translateY(-50%)' },
    bottom: { bottom: margin, top: 'auto', transform: 'none' },
  }[style.position]

  return (
    <div ref={containerRef} className="flex-1 min-h-0 rounded-xl bg-black shadow-lg flex items-center justify-center overflow-hidden">
      {box.w > 0 && (
        <div style={{ width: box.w, height: box.h }} className="relative overflow-hidden shrink-0">
          {imageUrl
            ? <>
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    opacity: transitionsEnabled && nextImageUrl ? 1 - transitionProgress : 1,
                    filter: currentFrameBlur > 0 ? `blur(${currentFrameBlur}px)` : 'none',
                    transform: `scale(${1 + Math.max(transitionProgress * 0.03, edgeBlurProgress * 0.02)})`,
                  }}
                />
                {transitionsEnabled && nextImageUrl && (
                  <img
                    src={nextImageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      opacity: transitionProgress,
                      filter: `blur(${nextFrameBlur || 10}px)`,
                      transform: `scale(${1.03 - transitionProgress * 0.03})`,
                    }}
                  />
                )}
              </>
            : <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-muted">Нет изображений</span>
              </div>
          }
          {watermarkUrl && (
            <img
              src={watermarkUrl}
              alt="Watermark"
              className="absolute z-10 object-contain pointer-events-none"
              style={{
                width: box.w * 0.12,
                top: box.w * 0.03,
                right: box.w * 0.03,
              }}
            />
          )}
          {subtitle && (
            <div className="absolute left-0 right-0 px-4 flex justify-center z-20"
              style={subtitlePos as React.CSSProperties}>
              <span style={{
                fontSize: fontSizePx,
                fontFamily: 'Arial, sans-serif',
                color: style.textColor,
                fontWeight: style.bold ? 'bold' : 'normal',
                background: `rgba(${hexToRgb(style.bgColor)},${style.bgOpacity / 100})`,
                padding: `${fontSizePx * 0.22}px ${fontSizePx * 0.55}px`,
                borderRadius: fontSizePx * 0.3,
                lineHeight: `${lineHeightPx}px`,
                textAlign: 'center',
                display: 'inline-block',
                maxWidth: '90%',
              }}>
                {subtitleTokens.map((token, index) => (
                  token.isWord && token.wordIndex === activeWordIndex
                    ? (
                      <span key={index} style={{ color: style.activeWordColor }}>
                        {token.text}
                      </span>
                    )
                    : token.text
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const TRACK_COLORS = [
  'bg-blue-500/25 border-blue-500/50',
  'bg-purple-500/25 border-purple-500/50',
  'bg-emerald-500/25 border-emerald-500/50',
  'bg-pink-500/25 border-pink-500/50',
  'bg-amber-500/25 border-amber-500/50',
]

function Timeline({
  duration, ttsStart, ttsDuration,
  images, imageDuration,
  speechAvailable, speechOnTimeline,
  musicAvailable, musicOnTimeline,
  subtitles, subtitlesAvailable, subtitlesOnTimeline,
  speechVolume, musicVolume, currentTime,
  onSeek, onReorder, onRemoveImage, onAddToTimeline,
  onRemoveSpeech, onAddSpeech,
  onRemoveMusic, onAddMusic,
  onRemoveSubtitles, onAddSubtitles,
  onSpeechVolume, onMusicVolume,
}: {
  duration: number; ttsStart: number; ttsDuration: number
  images: UploadedImage[]
  imageDuration: number
  speechAvailable: boolean
  speechOnTimeline: boolean
  musicAvailable: boolean
  musicOnTimeline: boolean
  subtitles: { index: number; startTime: number; endTime: number; text: string }[]
  subtitlesAvailable: boolean
  subtitlesOnTimeline: boolean
  speechVolume: number; musicVolume: number; currentTime: number
  onSeek: (t: number) => void
  onReorder: (from: number, to: number) => void
  onRemoveImage: (id: string) => void
  onAddToTimeline: (id: string, atIdx: number) => void
  onRemoveSpeech: () => void
  onAddSpeech: () => void
  onRemoveMusic: () => void
  onAddMusic: () => void
  onRemoveSubtitles: () => void
  onAddSubtitles: () => void
  onSpeechVolume: (v: number) => void
  onMusicVolume: (v: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [draftSpeechVolume, setDraftSpeechVolume] = useState(speechVolume)
  const [draftMusicVolume, setDraftMusicVolume] = useState(musicVolume)
  const isDraggingPlayhead = useRef(false)
  const totalWidth = Math.max(duration * PX_PER_SEC, 300)

  useEffect(() => {
    setDraftSpeechVolume(speechVolume)
  }, [speechVolume])

  useEffect(() => {
    setDraftMusicVolume(musicVolume)
  }, [musicVolume])

  const xToTime = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const scrollLeft = containerRef.current?.scrollLeft ?? 0
    const x = clientX - rect.left + scrollLeft - TIMELINE_LABEL_W
    return Math.max(0, Math.min(x / PX_PER_SEC, duration))
  }, [duration])

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingPlayhead.current = true
    onSeek(xToTime(e.clientX))
  }

  useEffect(() => {
    const move = (e: MouseEvent) => { if (isDraggingPlayhead.current) onSeek(xToTime(e.clientX)) }
    const up = () => { isDraggingPlayhead.current = false }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [xToTime, onSeek])

  const ticks = Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, i) => i * 5)

  const handleImageDrop = (e: React.DragEvent, toIdx: number) => {
    e.stopPropagation()
    const externalId = e.dataTransfer.getData(DT_IMG)
    if (externalId) {
      const fromIdx = images.findIndex(i => i.id === externalId)
      if (fromIdx === -1) {
        // Image not on timeline (excluded) — add it back at this position
        onAddToTimeline(externalId, toIdx)
      } else if (fromIdx !== toIdx) {
        onReorder(fromIdx, toIdx)
      }
    } else if (dragging !== null && dragging !== toIdx) {
      onReorder(dragging, toIdx)
    }
    setDragging(null); setDragOver(null)
  }

  const trackLabels = [
    { key: 'video', label: 'Видео' },
    ...(speechAvailable ? [{ key: 'tts', label: 'Речь' }] : []),
    ...(musicAvailable ? [{ key: 'music', label: 'Музыка' }] : []),
    ...(subtitlesAvailable ? [{ key: 'subtitles', label: 'Субт.' }] : []),
  ]

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Controls header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-4 flex-wrap">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider shrink-0">Таймлайн</p>
        <div className="flex items-center gap-2">
          <Volume2 size={12} className="text-muted shrink-0" />
          <span className="text-xs text-muted shrink-0">Речь</span>
          <input type="range" min={0} max={100} value={draftSpeechVolume}
            onChange={e => setDraftSpeechVolume(+e.target.value)}
            onMouseUp={() => onSpeechVolume(draftSpeechVolume)}
            onTouchEnd={() => onSpeechVolume(draftSpeechVolume)}
            onKeyUp={() => onSpeechVolume(draftSpeechVolume)}
            onBlur={() => onSpeechVolume(draftSpeechVolume)}
            className="w-20 accent-accent h-1 cursor-pointer" />
          <span className="text-xs text-muted w-7">{draftSpeechVolume}%</span>
        </div>
        {musicAvailable && (
          <div className="flex items-center gap-2">
            <Volume2 size={12} className="text-muted shrink-0" />
            <span className="text-xs text-muted shrink-0">Музыка</span>
            <input type="range" min={0} max={100} value={draftMusicVolume}
              onChange={e => setDraftMusicVolume(+e.target.value)}
              onMouseUp={() => onMusicVolume(draftMusicVolume)}
              onTouchEnd={() => onMusicVolume(draftMusicVolume)}
              onKeyUp={() => onMusicVolume(draftMusicVolume)}
              onBlur={() => onMusicVolume(draftMusicVolume)}
              className="w-20 accent-accent h-1 cursor-pointer" />
            <span className="text-xs text-muted w-7">{draftMusicVolume}%</span>
          </div>
        )}
      </div>

      {/* Scrollable tracks */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-hidden select-none">
        <div style={{ width: totalWidth + TIMELINE_LABEL_W, minWidth: '100%' }} className="relative">

          {/* Labels */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-surface-1 z-10 border-r border-border flex flex-col"
            style={{ width: TIMELINE_LABEL_W }}
          >
            <div style={{ height: RULER_H }} />
            {trackLabels.map((track, i, arr) => (
              <div key={track.key} style={{ height: TRACK_H }}
                className={clsx('flex items-center gap-2 px-3', i < arr.length - 1 && 'border-b border-border/50')}>
                <span className="text-xs text-muted truncate">{track.label}</span>
                {track.key === 'subtitles' && subtitlesOnTimeline && subtitles.length > 0 && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onRemoveSubtitles() }}
                    className="ml-auto w-4 h-4 rounded-full bg-red-500/85 hover:bg-red-500 flex items-center justify-center shrink-0"
                    title="Убрать субтитры с таймлайна"
                  >
                    <X size={8} className="text-white" />
                  </button>
                )}
                {track.key === 'tts' && speechOnTimeline && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onRemoveSpeech() }}
                    className="ml-auto w-4 h-4 rounded-full bg-red-500/85 hover:bg-red-500 flex items-center justify-center shrink-0"
                    title="Убрать речь с таймлайна"
                  >
                    <X size={8} className="text-white" />
                  </button>
                )}
                {track.key === 'music' && musicOnTimeline && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onRemoveMusic() }}
                    className="ml-auto w-4 h-4 rounded-full bg-red-500/85 hover:bg-red-500 flex items-center justify-center shrink-0"
                    title="Убрать музыку с таймлайна"
                  >
                    <X size={8} className="text-white" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Content */}
          <div style={{ marginLeft: TIMELINE_LABEL_W, width: totalWidth }}>
            {/* Ruler */}
            <div style={{ height: RULER_H }}
              className="relative bg-surface-2 border-b border-border cursor-col-resize"
              onMouseDown={handleMouseDown}>
              {ticks.map(t => (
                <div key={t} className="absolute top-0 flex flex-col items-center pointer-events-none"
                  style={{ left: t * PX_PER_SEC }}>
                  <div className="w-px h-2 bg-border mt-1" />
                  <span className="text-muted/60 mt-0.5 select-none" style={{ fontSize: 9 }}>{fmtTime(t)}</span>
                </div>
              ))}
            </div>

            {/* Video track */}
            <div
              style={{ height: TRACK_H }}
              className="relative bg-surface-2/40 border-b border-border/50 flex"
              onMouseDown={handleMouseDown}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                const externalId = e.dataTransfer.getData(DT_IMG)
                if (externalId && dragging === null) {
                  const fromIdx = images.findIndex(i => i.id === externalId)
                  if (fromIdx === -1) onAddToTimeline(externalId, images.length)
                  else onReorder(fromIdx, images.length - 1)
                }
                setDragging(null); setDragOver(null)
              }}
            >
              {images.map((img, idx) => (
                <div
                  key={img.id}
                  draggable
                  style={{ width: imageDuration * PX_PER_SEC - 2, marginRight: 2 }}
                  onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData(DT_IMG, img.id); setDragging(idx) }}
                  onDragEnter={e => { e.stopPropagation(); setDragOver(idx) }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleImageDrop(e, idx)}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                  className={clsx(
                    'group relative h-full rounded flex items-center overflow-hidden border cursor-grab',
                    TRACK_COLORS[idx % TRACK_COLORS.length],
                    dragging === idx && 'opacity-30',
                    dragOver === idx && dragging !== idx && 'ring-1 ring-accent',
                  )}
                >
                  <img src={img.url} alt="" className="h-full w-7 object-cover shrink-0 opacity-60" />
                  <span className="text-xs text-white/60 px-1">{idx + 1}</span>
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onRemoveImage(img.id) }}
                    className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-red-500/80 hidden group-hover:flex items-center justify-center z-20"
                  >
                    <X size={7} className="text-white" />
                  </button>
                </div>
              ))}
            </div>

            {/* TTS track — starts at ttsStart, spans ttsDuration */}
            {speechAvailable && (
            <div
              style={{ height: TRACK_H }}
              className="relative bg-surface-2/40 border-b border-border/50"
              onMouseDown={handleMouseDown}
              onDragOver={e => {
                if (e.dataTransfer.types.includes('cs-type')) e.preventDefault()
              }}
              onDrop={e => {
                const type = e.dataTransfer.getData('cs-type')
                if (type === 'tts') {
                  e.preventDefault()
                  e.stopPropagation()
                  onAddSpeech()
                }
              }}
            >
              {speechOnTimeline && ttsDuration > 0 ? (
                <div style={{
                  position: 'absolute',
                  left: ttsStart * PX_PER_SEC + 1,
                  width: Math.max(ttsDuration * PX_PER_SEC - 2, 0),
                  top: 6, bottom: 6,
                }}
                  className="rounded bg-accent/20 border border-accent/40 flex items-center px-2 pointer-events-none">
                  <span className="text-xs text-accent/70 truncate">TTS · {fmtTime(ttsDuration)}</span>
                </div>
              ) : (
                <div className="absolute inset-x-1 top-1.5 bottom-1.5 rounded border border-dashed border-accent/35 bg-accent/5 flex items-center justify-center px-3">
                  <span className="text-[11px] text-accent/70 text-center">
                    Перетащите сюда речь из ассетов
                  </span>
                </div>
              )}
            </div>
            )}

            {/* Music track — full duration with delete */}
            {musicAvailable && (
              <div
                style={{ height: TRACK_H }}
                className="relative bg-surface-2/40 border-b border-border/50"
                onMouseDown={handleMouseDown}
                onDragOver={e => {
                  if (e.dataTransfer.types.includes('cs-type')) e.preventDefault()
                }}
                onDrop={e => {
                  const type = e.dataTransfer.getData('cs-type')
                  if (type === 'music') {
                    e.preventDefault()
                    e.stopPropagation()
                    onAddMusic()
                  }
                }}
              >
                {musicOnTimeline ? (
                <div style={{
                  position: 'absolute',
                  left: 1,
                  width: Math.max(duration * PX_PER_SEC - 2, 0),
                  top: 6, bottom: 6,
                }}
                  className="rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center px-2 pointer-events-none">
                  <span className="text-xs text-emerald-400/70 truncate flex-1">Музыка · {fmtTime(duration)}</span>
                </div>
                ) : (
                  <div className="absolute inset-x-1 top-1.5 bottom-1.5 rounded border border-dashed border-emerald-500/35 bg-emerald-500/5 flex items-center justify-center px-3">
                    <span className="text-[11px] text-emerald-300/70 text-center">
                      Перетащите сюда музыку из ассетов
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Subtitle track — each block offset by LEAD_IN, with clear-all button */}
            {subtitlesAvailable && (
              <div
                style={{ height: TRACK_H }}
                className="relative bg-surface-2/40"
                onMouseDown={handleMouseDown}
                onDragOver={e => {
                  if (e.dataTransfer.types.includes('cs-type')) e.preventDefault()
                }}
                onDrop={e => {
                  const type = e.dataTransfer.getData('cs-type')
                  if (type === 'subtitles') {
                    e.preventDefault()
                    e.stopPropagation()
                    onAddSubtitles()
                  }
                }}
              >
                {subtitlesOnTimeline && subtitles.length > 0 ? subtitles.map(sub => (
                  <div key={sub.index} style={{
                    position: 'absolute',
                    left: sub.startTime * PX_PER_SEC,
                    width: Math.max((sub.endTime - sub.startTime) * PX_PER_SEC - 2, 16),
                    top: 6, bottom: 6,
                  }}
                    className="group rounded bg-amber-500/20 border border-amber-500/40 flex items-center px-1 overflow-hidden pointer-events-none">
                    <span className="text-amber-300/70 truncate flex-1" style={{ fontSize: 9 }}>{sub.text}</span>
                  </div>
                )) : (
                  <div className="absolute inset-x-1 top-1.5 bottom-1.5 rounded border border-dashed border-amber-500/35 bg-amber-500/5 flex items-center justify-center px-3">
                    <span className="text-[11px] text-amber-200/70 text-center">
                      Перетащите сюда субтитры из ассетов
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Playhead */}
          <div className="absolute top-0 bottom-0 z-20 pointer-events-none"
            style={{ left: TIMELINE_LABEL_W + currentTime * PX_PER_SEC }}>
            <div className="w-px h-full bg-red-500/80" />
            <div className="absolute top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Step7_Preview() {
  const {
    projectId, images, audioFilename, audioDuration, selectedMusicId, musicVolume, speechVolume,
    subtitles, subtitleStyle, setSubtitleStyle, setMusicVolume, setSpeechVolume,
    nextStep, prevStep,
    enableImageTransitions, setEnableImageTransitions,
    watermarkFilename, previewFormatId, setPreviewFormatId, previewVideoUrl, setPreviewVideo,
    timelineImageIds: storeTimelineIds, setTimelineImageIds: syncTimelineIds,
    timelineHasSpeech, setTimelineHasSpeech,
    timelineHasMusic, setTimelineHasMusic,
    timelineHasSubtitles, setTimelineHasSubtitles,
  } = useWizardStore()

  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [timelineImageIds, setTimelineImageIds] = useState<string[]>(
    () => storeTimelineIds.length ? storeTimelineIds : images.map(i => i.id)
  )
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'rendering' | 'ready' | 'error'>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewRequestRef = useRef(0)
  const previewAbortRef = useRef<AbortController | null>(null)
  const previewInFlightRef = useRef(false)
  const pendingPreviewRef = useRef<{
    signature: string
    payload: Parameters<typeof videoApi.renderPreview>[1]
  } | null>(null)
  const activePreviewSignatureRef = useRef<string | null>(null)
  const desiredTimeRef = useRef(0)
  const shouldResumeRef = useRef(false)
  const formatId = previewFormatId

  // Sync local → store whenever timeline order/selection changes
  useEffect(() => {
    syncTimelineIds(timelineImageIds)
  }, [timelineImageIds])

  // Add newly uploaded images to timeline (that aren't already there)
  useEffect(() => {
    setTimelineImageIds(prev => {
      const prevSet = new Set(prev)
      const newIds = images.map(i => i.id).filter(id => !prevSet.has(id))
      return [...prev.filter(id => images.some(img => img.id === id)), ...newIds]
    })
  }, [images])

  const timelineImages = timelineImageIds
    .map(id => images.find(img => img.id === id))
    .filter(Boolean) as UploadedImage[]
  const timelineImageFilenames = timelineImages.map(image => image.filename)

  const totalDuration = audioDuration > 0 ? audioDuration + LEAD_IN + LEAD_OUT : 0
  const imageDuration = totalDuration > 0 && timelineImages.length > 0 ? totalDuration / timelineImages.length : 5
  const selectedFormat = FORMATS.find(f => f.id === formatId) ?? FORMATS[0]
  const timelineImageKey = timelineImageFilenames.join('|')
  const subtitlesKey = JSON.stringify(subtitles)
  const subtitleStyleKey = JSON.stringify(subtitleStyle)

  const timelineSubtitles = (timelineHasSubtitles ? subtitles : []).map(s => ({
    ...s,
    startTime: Math.max(0, s.startTime + LEAD_IN - SUBTITLE_ADVANCE),
    endTime: Math.max(0.01, s.endTime + LEAD_IN - SUBTITLE_ADVANCE),
  }))

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      previewAbortRef.current?.abort()
      videoRef.current?.pause()
    }
  }, [])

  const stopPlayback = useCallback(() => {
    videoRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const startPlayback = useCallback((startPos: number) => {
    const video = videoRef.current
    if (!video || !previewVideoUrl) return
    const duration = video.duration || totalDuration
    const targetTime = startPos >= duration ? 0 : Math.max(0, Math.min(startPos, duration))
    if (Math.abs(video.currentTime - targetTime) > 0.05) {
      video.currentTime = targetTime
    }
    video.play().catch(() => {})
  }, [previewVideoUrl, totalDuration])

  const seekTo = useCallback((t: number) => {
    const video = videoRef.current
    const duration = video?.duration || totalDuration
    const clamped = Math.max(0, Math.min(t, duration))
    if (video) video.currentTime = clamped
    setCurrentTime(clamped)
  }, [totalDuration])

  const handleSeek = useCallback((t: number) => {
    seekTo(t)
  }, [seekTo])

  const handleReset = () => {
    stopPlayback()
    seekTo(0)
  }

  const handleReorder = (from: number, to: number) => {
    setTimelineImageIds(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncTime = () => setCurrentTime(video.currentTime || 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(video.duration || totalDuration)
    }
    const onLoaded = () => {
      const targetTime = Math.max(0, Math.min(desiredTimeRef.current, video.duration || totalDuration || 0))
      if (targetTime > 0) video.currentTime = targetTime
      setCurrentTime(video.currentTime || 0)
      if (shouldResumeRef.current) {
        video.play().catch(() => {})
      }
      shouldResumeRef.current = false
      setPreviewStatus('ready')
      setPreviewError(null)
    }

    video.addEventListener('timeupdate', syncTime)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('loadedmetadata', onLoaded)
    return () => {
      video.removeEventListener('timeupdate', syncTime)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [previewVideoUrl, totalDuration])

  const runPreviewRender = useCallback(async (
    signature: string,
    payload: Parameters<typeof videoApi.renderPreview>[1]
  ) => {
    if (!projectId) return

    previewInFlightRef.current = true
    activePreviewSignatureRef.current = signature
    previewAbortRef.current?.abort()
    const abortController = new AbortController()
    previewAbortRef.current = abortController
    const requestId = ++previewRequestRef.current

    try {
      const res = await videoApi.renderPreview(projectId, payload, abortController.signal)
      if (requestId !== previewRequestRef.current) return
      setPreviewVideo(
        res.filename,
        `${BASE_URL}/media/video/${projectId}/${res.filename}?v=${Date.now()}`
      )
    } catch (error: any) {
      if (abortController.signal.aborted) return
      if (requestId !== previewRequestRef.current) return
      setPreviewStatus('error')
      setPreviewError(error?.response?.data?.detail || 'Не удалось обновить preview.mp4')
    } finally {
      if (previewAbortRef.current === abortController) {
        previewAbortRef.current = null
      }
      previewInFlightRef.current = false

      const pending = pendingPreviewRef.current
      if (pending && pending.signature !== signature) {
        pendingPreviewRef.current = null
        void runPreviewRender(pending.signature, pending.payload)
      }
    }
  }, [projectId, setPreviewVideo])

  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    if (!projectId || !audioFilename || timelineImages.length === 0) {
      previewAbortRef.current?.abort()
      pendingPreviewRef.current = null
      activePreviewSignatureRef.current = null
      setPreviewStatus('idle')
      setPreviewError(null)
      setPreviewVideo(null, null)
      return
    }

    const payload = {
      format: { id: selectedFormat.id, width: selectedFormat.width, height: selectedFormat.height },
      audio_filename: audioFilename,
      image_filenames: timelineImageFilenames,
      music_id: timelineHasMusic ? selectedMusicId : null,
      music_volume: musicVolume / 100,
      subtitles: timelineHasSubtitles ? subtitles : [],
      subtitle_style: subtitleStyle,
      speech_volume: timelineHasSpeech ? speechVolume / 100 : 0,
      audio_duration: audioDuration,
      enable_image_transitions: false,
      watermark_filename: watermarkFilename,
      lead_in: LEAD_IN,
      lead_out: LEAD_OUT,
    } satisfies Parameters<typeof videoApi.renderPreview>[1]
    const signature = JSON.stringify(payload)

    if (!previewVideoUrl && !previewInFlightRef.current) {
      setPreviewStatus('rendering')
    }

    previewTimerRef.current = setTimeout(() => {
      desiredTimeRef.current = videoRef.current?.currentTime ?? currentTime
      shouldResumeRef.current = !!videoRef.current && !videoRef.current.paused
      setPreviewStatus('rendering')
      setPreviewError(null)

      if (previewInFlightRef.current) {
        pendingPreviewRef.current = { signature, payload }
        return
      }
      if (activePreviewSignatureRef.current === signature) {
        setPreviewStatus('ready')
        return
      }
      void runPreviewRender(signature, payload)
    }, 500)

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    }
  }, [
    projectId,
    audioFilename,
    audioDuration,
    timelineImageKey,
    selectedMusicId,
    musicVolume,
    subtitlesKey,
    timelineHasSpeech,
    timelineHasMusic,
    timelineHasSubtitles,
    subtitleStyleKey,
    speechVolume,
    watermarkFilename,
    selectedFormat.id,
    selectedFormat.width,
    selectedFormat.height,
    currentTime,
    previewVideoUrl,
    runPreviewRender,
    setPreviewVideo,
  ])

  const handleAddToTimeline = (id: string, atIdx: number) => {
    setTimelineImageIds(prev => {
      if (prev.includes(id)) return prev
      const next = [...prev]
      next.splice(atIdx, 0, id)
      return next
    })
  }

  // Spacebar: play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement
      if (t instanceof HTMLTextAreaElement) return
      if (t instanceof HTMLInputElement && t.type !== 'range') return
      e.preventDefault()
      if (isPlaying) stopPlayback()
      else startPlayback(currentTime)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPlaying, currentTime, stopPlayback, startPlayback])

  return (
    <div className="-m-8 flex" style={{ height: 'calc(100vh - 116px)' }}>

      {/* ── LEFT: Assets + Style (top) · Playback + Timeline + Nav (bottom) ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top: Assets + Style panels */}
        <div className="flex gap-3 p-5 pb-3 flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <AssetsPanel
            images={images}
              audioUrl={audioFilename ? 'ready' : null}
              audioDuration={audioDuration}
              selectedMusicId={selectedMusicId}
              subtitles={subtitles}
            />
          </div>
          <div className="flex-1 min-w-0">
            <StyleEditor
              style={subtitleStyle}
              onChange={setSubtitleStyle}
              disabled={!timelineHasSubtitles}
            />
          </div>
        </div>

        {/* Bottom: Playback + Timeline + Nav */}
        <div className="flex flex-col gap-3 px-5 pb-5 shrink-0">
          <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
            <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableImageTransitions}
                onChange={e => setEnableImageTransitions(e.target.checked)}
                className="accent-accent"
              />
              Плавные переходы между кадрами (fade + blur)
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleReset}
              className="w-7 h-7 rounded-lg bg-surface-2 border border-border hover:border-accent flex items-center justify-center transition-colors">
              <SkipBack size={13} className="text-muted" />
            </button>
            <button onClick={isPlaying ? stopPlayback : () => startPlayback(currentTime)}
              disabled={!previewVideoUrl || !totalDuration}
              className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-40 flex items-center justify-center transition-colors">
              {isPlaying ? <Pause size={15} className="text-white" /> : <Play size={15} className="text-white ml-0.5" />}
            </button>
            <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden cursor-pointer"
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect()
                handleSeek(((e.clientX - r.left) / r.width) * totalDuration)
              }}>
              <div className="h-full bg-accent rounded-full"
                style={{ width: `${totalDuration ? (currentTime / totalDuration) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-muted tabular-nums">{fmtTime(currentTime)} / {fmtTime(totalDuration)}</span>
          </div>

          <Timeline
            duration={totalDuration || 30}
            ttsStart={LEAD_IN}
            ttsDuration={audioDuration || 0}
            images={timelineImages}
            imageDuration={imageDuration}
            speechAvailable={!!audioFilename}
            speechOnTimeline={timelineHasSpeech}
            musicAvailable={!!selectedMusicId}
            musicOnTimeline={timelineHasMusic}
            subtitles={timelineSubtitles}
            subtitlesAvailable={subtitles.length > 0}
            subtitlesOnTimeline={timelineHasSubtitles}
            speechVolume={speechVolume}
            musicVolume={musicVolume}
            currentTime={currentTime}
            onSeek={handleSeek}
            onReorder={handleReorder}
            onRemoveImage={id => setTimelineImageIds(prev => prev.filter(x => x !== id))}
            onAddToTimeline={handleAddToTimeline}
            onRemoveSpeech={() => setTimelineHasSpeech(false)}
            onAddSpeech={() => setTimelineHasSpeech(true)}
            onRemoveMusic={() => setTimelineHasMusic(false)}
            onAddMusic={() => setTimelineHasMusic(true)}
            onRemoveSubtitles={() => setTimelineHasSubtitles(false)}
            onAddSubtitles={() => setTimelineHasSubtitles(true)}
            onSpeechVolume={setSpeechVolume}
            onMusicVolume={setMusicVolume}
          />

          <div className="flex justify-between">
            <Button variant="ghost" onClick={prevStep} icon={<ArrowLeft size={16} />}>Назад</Button>
            <Button onClick={nextStep} icon={<ArrowRight size={16} />}>К экспорту</Button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Format picker + full-height preview ────────────────── */}
      <div className="w-[35%] shrink-0 flex flex-col gap-2 p-5 pl-2">
        {/* Format picker */}
        <div className="flex gap-1 shrink-0">
          {FORMATS.map(f => (
            <button key={f.id} onClick={() => setPreviewFormatId(f.id)}
              className={clsx('flex-1 py-1.5 rounded-lg border text-xs transition-colors',
                formatId === f.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-white'
              )}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-border bg-black relative">
          {previewVideoUrl ? (
            <video
              ref={videoRef}
              key={previewVideoUrl}
              src={previewVideoUrl}
              className="w-full h-full object-contain bg-black"
              playsInline
              preload="auto"
              onClick={() => {
                if (isPlaying) stopPlayback()
                else startPlayback(currentTime)
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              {(!audioFilename || timelineImages.length === 0) && 'Добавьте озвучку и изображения'}
            </div>
          )}

          {previewStatus === 'rendering' && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="w-11 h-11 rounded-full border border-white/10 bg-surface-1/90 shadow-lg backdrop-blur-md flex items-center justify-center">
                <Loader2 size={18} className="animate-spin text-accent" />
              </div>
            </div>
          )}

          {previewStatus === 'error' && previewError && (
            <div className="absolute left-3 right-3 bottom-3 rounded-lg border border-danger/30 bg-danger/15 px-3 py-2 text-xs text-white/85">
              {previewError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
