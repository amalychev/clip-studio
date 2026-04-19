import { useState } from 'react'
import { useWizardStore } from '../../stores/wizardStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Badge } from '../ui/Badge'
import { subtitleApi } from '../../lib/api'
import type { SubtitleEntry } from '../../types'
import { HelpCircle, ArrowLeft, ArrowRight, Subtitles, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 1000)
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`
}

export function Step6_Subtitles() {
  const { rawText, audioDuration, subtitles, projectId,
    setSubtitles, updateSubtitle, nextStep, prevStep } = useWizardStore()
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await subtitleApi.generate({
        text: rawText,
        duration: audioDuration,
        project_id: projectId,
      })
      setSubtitles(res.subtitles)
      toast.success(`${res.subtitles.length} субтитров создано`)
    } catch {
      toast.error('Ошибка генерации субтитров')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full animate-slide-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Субтитры</h2>
        <Tooltip content="Субтитры автоматически распределяются по длительности аудио. Вы можете редактировать каждую строку.">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
        {subtitles.length > 0 && (
          <Badge variant="success" className="ml-auto">{subtitles.length} строк</Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleGenerate} loading={loading} icon={<Wand2 size={16} />}>
          {subtitles.length > 0 ? 'Перегенерировать' : 'Создать субтитры'}
        </Button>
        {audioDuration > 0 && (
          <span className="text-sm text-muted">
            Длительность аудио: {Math.floor(audioDuration / 60)}:{String(Math.floor(audioDuration % 60)).padStart(2,'0')}
          </span>
        )}
      </div>

      <p className="text-xs text-muted">
        Субтитры генерируются по исходному тексту со 2 шага, а не по тексту TTS с 3 шага.
      </p>

      {subtitles.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center gap-4 py-14 rounded-xl border border-dashed border-border">
          <div className="w-14 h-14 rounded-2xl bg-surface-2 flex items-center justify-center">
            <Subtitles size={26} className="text-muted" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white/70">Субтитры не созданы</p>
            <p className="text-xs text-muted mt-1">Нажмите «Создать субтитры» или пропустите этот шаг</p>
          </div>
        </div>
      )}

      {subtitles.length > 0 && (
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
          {subtitles.map((sub: SubtitleEntry) => (
            <div key={sub.index} className="bg-surface-2 border border-border rounded-lg p-3 flex gap-3">
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted font-mono">{formatTime(sub.startTime)}</p>
                <p className="text-xs text-muted/50 font-mono">{formatTime(sub.endTime)}</p>
              </div>
              <div className="w-px bg-border" />
              <textarea
                value={sub.text}
                onChange={e => updateSubtitle(sub.index, e.target.value)}
                rows={2}
                className="flex-1 bg-transparent text-sm text-white resize-none focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={prevStep} icon={<ArrowLeft size={16} />}>Назад</Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={nextStep}>Пропустить</Button>
          <Button onClick={nextStep} disabled={subtitles.length === 0} icon={<ArrowRight size={16} />}>
            К просмотру
          </Button>
        </div>
      </div>
    </div>
  )
}
