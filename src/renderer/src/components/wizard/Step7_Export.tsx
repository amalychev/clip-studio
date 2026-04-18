import { useState } from 'react'
import { useWizardStore } from '../../stores/wizardStore'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { Progress } from '../ui/Progress'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { BASE_URL } from '../../lib/api'
import type { VideoFormat } from '../../types'
import { HelpCircle, ArrowLeft, Video, FolderOpen, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

export function Step7_Export() {
  const {
    projectId, exportFormats, exportProgress, exportedFiles,
    toggleFormat, setExportProgress, setExportedFiles, prevStep,
    audioFilename, images, selectedMusicId, musicVolume, subtitles,
    subtitleStyle, speechVolume, audioDuration, timelineImageIds,
  } = useWizardStore()
  const [generating, setGenerating] = useState(false)

  const enabledFormats = exportFormats.filter(f => f.enabled)

  const handleExport = async () => {
    if (!projectId || enabledFormats.length === 0) return
    setGenerating(true)
    setExportProgress({ stage: 'init', percent: 0, message: 'Подготовка...', done: false })

    const payload = {
      formats: enabledFormats.map(f => ({ id: f.id, width: f.width, height: f.height })),
      audio_filename: audioFilename,
      image_filenames: (timelineImageIds.length
        ? timelineImageIds.map(id => images.find(i => i.id === id)?.filename).filter(Boolean)
        : images.map(i => i.filename)) as string[],
      music_id: selectedMusicId,
      music_volume: musicVolume / 100,
      subtitles: subtitles,
      subtitle_style: subtitleStyle,
      speech_volume: speechVolume / 100,
      audio_duration: audioDuration,
    }

    try {
      const res = await fetch(`${BASE_URL}/video/export/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace('data: ', ''))
            setExportProgress(data)
            if (data.done) {
              setExportedFiles(data.files || [])
              setGenerating(false)
              toast.success('Видео успешно создано!')
            }
            if (data.error) {
              setGenerating(false)
              toast.error(`Ошибка: ${data.error}`)
            }
          } catch {}
        }
      }
    } catch (e) {
      toast.error('Ошибка соединения с бекендом')
      setExportProgress(null)
      setGenerating(false)
    }
  }

  const openFile = (path: string) => {
    window.api?.openPath(path)
  }

  const saveAs = async (path: string, formatName: string) => {
    const dir = await window.api?.selectDirectory()
    if (!dir) return
    try {
      await fetch(`${BASE_URL}/video/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: path, dest_dir: dir, name: formatName }),
      })
      toast.success(`Сохранено в ${dir}`)
    } catch {
      toast.error('Ошибка сохранения')
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full animate-slide-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Экспорт видео</h2>
        <Tooltip content="Выберите форматы для экспорта. Видео создаётся из изображений с плавными переходами и наложением субтитров.">
          <HelpCircle size={16} className="text-muted" />
        </Tooltip>
      </div>

      {/* Format selector */}
      <div>
        <p className="text-sm font-medium text-white/80 mb-3">Форматы видео</p>
        <div className="grid grid-cols-2 gap-3">
          {exportFormats.map((fmt: VideoFormat) => (
            <Card
              key={fmt.id}
              hover
              active={fmt.enabled}
              onClick={() => !generating && toggleFormat(fmt.id)}
              className="flex items-start gap-3"
            >
              <div className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                fmt.enabled ? 'bg-accent/20' : 'bg-surface-3'
              )}>
                <Video size={14} className={fmt.enabled ? 'text-accent' : 'text-muted'} />
              </div>
              <div>
                <p className="text-sm font-medium">{fmt.name}</p>
                <p className="text-xs text-muted">{fmt.description}</p>
                <p className="text-xs text-muted">{fmt.width}×{fmt.height}</p>
              </div>
              {fmt.enabled && <Badge variant="accent" className="ml-auto shrink-0">✓</Badge>}
            </Card>
          ))}
        </div>
      </div>

      {/* Progress */}
      {exportProgress && (
        <div className="bg-surface-2 border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {exportProgress.done && !exportProgress.error && (
              <CheckCircle2 size={16} className="text-success" />
            )}
            {exportProgress.error && (
              <AlertCircle size={16} className="text-danger" />
            )}
            <span className="text-sm font-medium">{exportProgress.message}</span>
          </div>
          <Progress
            value={exportProgress.percent}
            animated={!exportProgress.done}
            variant={exportProgress.error ? 'danger' : exportProgress.done ? 'success' : 'default'}
          />
        </div>
      )}

      {/* Results */}
      {exportedFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-white/80">Готовые файлы</p>
          {exportedFiles.map((file: any) => (
            <div key={file.format} className="bg-surface-2 border border-success/30 rounded-lg p-3 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{file.format}</p>
                <p className="text-xs text-muted truncate">{file.path}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" icon={<FolderOpen size={12} />} onClick={() => openFile(file.path)}>
                  Открыть
                </Button>
                <Button size="sm" variant="secondary" icon={<Download size={12} />} onClick={() => saveAs(file.path, file.format)}>
                  Сохранить
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={prevStep} disabled={generating} icon={<ArrowLeft size={16} />}>Назад</Button>
        <Button
          onClick={handleExport}
          loading={generating}
          disabled={enabledFormats.length === 0 || generating}
          icon={<Video size={16} />}
          size="lg"
        >
          {generating ? 'Генерация...' : `Создать видео (${enabledFormats.length})`}
        </Button>
      </div>
    </div>
  )
}
