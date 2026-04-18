import { clsx } from 'clsx'
import { Check } from 'lucide-react'

const STEPS = [
  { n: 1, label: 'Текст' },
  { n: 2, label: 'AI-обработка' },
  { n: 3, label: 'Аудио' },
  { n: 4, label: 'Изображения' },
  { n: 5, label: 'Музыка' },
  { n: 6, label: 'Субтитры' },
  { n: 7, label: 'Превью' },
  { n: 8, label: 'Экспорт' },
]

interface Props {
  current: number
  onStepClick?: (n: number) => void
}

export function StepIndicator({ current, onStepClick }: Props) {
  return (
    <div className="flex items-center gap-0 px-6 py-4 border-b border-border bg-surface-1 overflow-x-auto">
      {STEPS.map(({ n, label }, i) => {
        const done = n < current
        const active = n === current

        return (
          <div key={n} className="flex items-center shrink-0">
            <button
              onClick={() => done && onStepClick?.(n)}
              disabled={!done}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all',
                active && 'text-white font-medium',
                done && 'text-success cursor-pointer hover:bg-surface-2',
                !active && !done && 'text-muted cursor-default',
              )}
            >
              <span className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all',
                active && 'bg-accent text-white',
                done && 'bg-success/20 text-success',
                !active && !done && 'bg-surface-3 text-muted',
              )}>
                {done ? <Check size={12} /> : n}
              </span>
              <span className="hidden sm:block">{label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={clsx(
                'w-8 h-px mx-1',
                n < current ? 'bg-success/40' : 'bg-border'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
