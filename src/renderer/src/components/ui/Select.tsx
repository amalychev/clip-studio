import { type SelectHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'

interface SelectOption { value: string; label: string; disabled?: boolean }

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  options: SelectOption[]
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, hint, options, className, ...rest }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white/80">{label}</label>}
      <div className="relative">
        <select
          ref={ref}
          {...rest}
          className={clsx(
            'w-full appearance-none bg-surface-2 border border-border rounded-lg',
            'text-sm text-white pl-3 pr-9 py-2.5 transition-colors',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
        >
          {options.map(o => (
            <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
)
Select.displayName = 'Select'
