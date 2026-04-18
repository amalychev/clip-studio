import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-accent hover:bg-accent-hover text-white focus:ring-accent': variant === 'primary',
          'bg-surface-2 hover:bg-surface-3 text-white border border-border focus:ring-border': variant === 'secondary',
          'hover:bg-surface-2 text-muted hover:text-white focus:ring-border': variant === 'ghost',
          'bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30 focus:ring-danger': variant === 'danger',
          'bg-success/15 hover:bg-success/25 text-success border border-success/30 focus:ring-success': variant === 'success',
          'px-3 py-1.5 text-xs': size === 'sm',
          'px-4 py-2.5 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}
