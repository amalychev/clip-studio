import { useState, useRef } from 'react'
import { useWizardStore } from '../../stores/wizardStore'
import { Select } from '../ui/Select'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Badge } from '../ui/Badge'
import { ttsApi, BASE_URL } from '../../lib/api'
import { TTS_VOICES } from '../../types'
import { HelpCircle, Mic, ArrowLeft, ArrowRight, CheckCircle2, Play, Pause, Volume2 } from 'lucide-react'
import toast from 'react-hot-toast'

export function Step3_Audio() {
  const { preparedText, audioUrl, audioFilename, audioDuration, projectId,
    setAudio, setPreparedText, nextStep, prevStep } = useWizardStore()
  const [ttsVoice, setTtsVoice] = useState('kseniya')
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause() } else { a.play() }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    const a = audioRef.current
    if (!a || !a.duration) return
    setProgress((a.currentTime / a.duration) * 100)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current
    if (!a) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
  }

  const handleGenerate = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await ttsApi.generate({
        text: preparedText,
        voice: ttsVoice,
        project_id: projectId,
      })
      const freshAudioUrl = `${BASE_URL}/media/audio/${projectId}/${res.filename}?v=${Date.now()}`
      setAudio(freshAudioUrl, res.filename, res.duration)
      setPlaying(false)
      setProgress(0)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current.load()
      }
      toast.success('Аудио сгенерировано')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Ошибка синтеза речи')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="max-w-2xl mx-auto w-full animate-slide-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Генерация аудио (TTS)</h2>
        <Tooltip content="Silero v5 работает локально — не требует интернета и Docker. При первом запуске загружает модель ~100MB.">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
      </div>

      {/* Text preview — editable */}
      <textarea
        value={preparedText}
        onChange={e => setPreparedText(e.target.value)}
        rows={6}
        className="w-full bg-surface-2 border border-border rounded-xl text-sm text-white/80 leading-relaxed px-4 py-3 resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      {/* Voice selector + generate */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Select
              label="Голос"
              value={ttsVoice}
              onChange={e => setTtsVoice(e.target.value)}
              options={TTS_VOICES.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
            />
          </div>
          <Button onClick={handleGenerate} loading={loading} icon={<Mic size={16} />}>
            {audioUrl ? 'Перегенерировать' : 'Сгенерировать'}
          </Button>
        </div>
        <p className="text-xs text-muted">Silero v5 ru — высококачественная русская TTS (работает офлайн)</p>
      </div>

      {loading && (
        <p className="text-xs text-muted text-center">
          При первом вызове модель загружается (~100 MB) — это займёт немного времени
        </p>
      )}

      {/* Audio player */}
      {audioUrl && (
        <div className="bg-surface-2 border border-success/30 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-success" />
              <span className="text-sm font-medium">Аудио готово</span>
              <Badge variant="success">{formatDuration(audioDuration)}</Badge>
            </div>
            <span className="text-xs text-muted">{audioFilename}</span>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setPlaying(false)}
          />

          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center shrink-0 transition-colors"
            >
              {playing ? <Pause size={14} className="text-white" /> : <Play size={14} className="text-white ml-0.5" />}
            </button>

            <div
              className="flex-1 h-1.5 bg-surface-3 rounded-full cursor-pointer group"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-accent rounded-full transition-all pointer-events-none"
                style={{ width: `${progress}%` }}
              />
            </div>

            <Volume2 size={14} className="text-muted shrink-0" />
            <span className="text-xs text-muted w-10 text-right shrink-0">
              {formatDuration(audioDuration)}
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={prevStep} icon={<ArrowLeft size={16} />}>Назад</Button>
        <Button onClick={nextStep} disabled={!audioUrl} icon={<ArrowRight size={16} />}>
          К изображениям
        </Button>
      </div>
    </div>
  )
}
