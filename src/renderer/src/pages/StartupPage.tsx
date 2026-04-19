import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import {
  CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react'
import logoUrl from '../assets/clip-studio-logo.png'

interface ProgressData {
  stage: string
  message: string
  percent: number
  log?: string
}

interface Props {
  onDone: () => void
}

const STAGE_LABELS: Record<string, { label: string; icon: string }> = {
  uv:     { label: 'uv (менеджер пакетов)', icon: '⚡' },
  python: { label: 'Python 3.13', icon: '🐍' },
  deps:   { label: 'Зависимости (PyTorch, Silero)', icon: '📦' },
  backend:{ label: 'Бекенд API', icon: '🚀' },
  done:   { label: 'Готово', icon: '✅' },
  error:  { label: 'Ошибка', icon: '❌' },
}

export function StartupPage({ onDone }: Props) {
  const [progress, setProgress] = useState<ProgressData>({ stage: 'init', message: 'Инициализация...', percent: 0 })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [completedStages, setCompletedStages] = useState<string[]>([])

  useEffect(() => {
    window.startup?.onProgress((data) => {
      setProgress(data)
setCompletedStages(prev => {
        const stages = ['uv', 'python', 'deps', 'backend']
        const currentIdx = stages.indexOf(data.stage)
        if (currentIdx < 0) return prev
        return stages.slice(0, currentIdx).filter(s => !prev.includes(s)).concat(prev)
      })
    })

    window.startup?.onDone(() => {
      setDone(true)
      setCompletedStages(['python', 'ffmpeg', 'venv', 'deps', 'backend'])
      setTimeout(onDone, 800)
    })

    window.startup?.onError((data) => {
      setError(data.message)
    })
  }, [onDone])

const handleRetry = async () => {
    setError(null)
    setProgress({ stage: 'init', message: 'Повторный запуск...', percent: 0 })
    setCompletedStages([])
    try {
      await window.startup?.retry()
    } catch { /* handled by onError */ }
  }

  const stages = ['uv', 'python', 'deps', 'backend']

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-surface z-50">
      {/* Animated background dots */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-96 h-96 rounded-full bg-accent/3 blur-3xl animate-pulse-slow"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              animationDelay: `${i * 0.8}s`,
              transform: 'translate(-50%,-50%)',
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className={clsx(
            'w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500',
            done ? 'bg-success/20 shadow-lg shadow-success/20' : 'bg-accent/20 shadow-lg shadow-accent/20',
            error && 'bg-danger/20 shadow-lg shadow-danger/20'
          )}>
            {done
              ? <CheckCircle2 size={32} className="text-success" />
              : error
              ? <AlertCircle size={32} className="text-danger" />
              : <img src={logoUrl} alt="Clip Studio" className={clsx('w-9 h-9 rounded-xl object-cover', !done && 'animate-pulse')} />
            }
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Clip Studio</h1>
            <p className="text-sm text-muted mt-0.5">Подготовка окружения</p>
          </div>
        </div>

        {/* Stage checklist */}
        <div className="flex flex-col gap-2 mb-6">
          {stages.map(stage => {
            const isComplete = completedStages.includes(stage) || done
            const isCurrent = progress.stage === stage && !done
            const info = STAGE_LABELS[stage]

            return (
              <div key={stage} className={clsx(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300',
                isComplete ? 'bg-success/8 border-success/20' :
                isCurrent ? 'bg-accent/10 border-accent/30' :
                'bg-surface-1 border-border opacity-50'
              )}>
                <span className="text-base">{info.icon}</span>
                <span className={clsx(
                  'text-sm font-medium flex-1',
                  isComplete ? 'text-success' : isCurrent ? 'text-white' : 'text-muted'
                )}>
                  {info.label}
                </span>
                {isComplete && <CheckCircle2 size={14} className="text-success shrink-0" />}
                {isCurrent && (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
                )}
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        {!error && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-muted mb-2">
              <span className="truncate max-w-[80%]">{progress.message}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-700 ease-out',
                  done ? 'bg-success' : 'bg-accent'
                )}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-danger mb-1">Ошибка запуска</p>
                <pre className="text-xs text-white/70 whitespace-pre-wrap font-mono leading-relaxed">
                  {error}
                </pre>
              </div>
            </div>
            <button
              onClick={handleRetry}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              <RefreshCw size={14} />
              Повторить
            </button>
          </div>
        )}


        {/* First run note */}
        {(progress.stage === 'deps' || progress.stage === 'python' || progress.stage === 'uv') && !error && (
          <p className="text-center text-xs text-muted mt-4 leading-relaxed">
            Первый запуск: скачивание Python и PyTorch (~350 MB суммарно).<br />
            ffmpeg встроен в приложение. Последующие запуски — мгновенные.
          </p>
        )}
      </div>
    </div>
  )
}
