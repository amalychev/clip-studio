import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { clsx } from 'clsx'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, hint, error, prefix, suffix, className, ...rest }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-white/80">{label}</label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-muted pointer-events-none">{prefix}</span>
        )}
        <input
          ref={ref}
          {...rest}
          className={clsx(
            'w-full bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-muted transition-colors',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            prefix ? 'pl-9' : 'pl-3',
            suffix ? 'pr-9' : 'pr-3',
            'py-2.5',
            error && 'border-danger focus:border-danger focus:ring-danger',
            className
          )}
        />
        {suffix && (
          <span className="absolute right-3 text-muted">{suffix}</span>
        )}
      </div>
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
