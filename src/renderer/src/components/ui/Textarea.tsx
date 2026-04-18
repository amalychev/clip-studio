import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ label, hint, error, className, ...rest }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white/80">{label}</label>}
      <textarea
        ref={ref}
        {...rest}
        className={clsx(
          'w-full bg-surface-2 border border-border rounded-lg text-sm text-white placeholder-muted',
          'px-3 py-2.5 resize-none transition-colors',
          'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-danger focus:border-danger focus:ring-danger',
          className
        )}
      />
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
)
Textarea.displayName = 'Textarea'
