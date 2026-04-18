import { clsx } from 'clsx'

interface Props {
  value: number
  max?: number
  label?: string
  message?: string
  variant?: 'default' | 'success' | 'danger'
  animated?: boolean
  className?: string
}

export function Progress({ value, max = 100, label, message, variant = 'default', animated, className }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {(label || message) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-sm font-medium text-white/80">{label}</span>}
          {message && <span className="text-xs text-muted">{message}</span>}
        </div>
      )}
      <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500 ease-out',
            {
              'bg-accent': variant === 'default',
              'bg-success': variant === 'success',
              'bg-danger': variant === 'danger',
              'animate-pulse-slow': animated && pct < 100,
            }
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted text-right">{Math.round(pct)}%</div>
    </div>
  )
}
