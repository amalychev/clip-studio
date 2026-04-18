import { type ReactNode } from 'react'
import { clsx } from 'clsx'

interface Props {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent'
  className?: string
}

export function Badge({ children, variant = 'default', className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        {
          'bg-surface-3 text-muted border border-border': variant === 'default',
          'bg-success/15 text-success border border-success/30': variant === 'success',
          'bg-warning/15 text-warning border border-warning/30': variant === 'warning',
          'bg-danger/15 text-danger border border-danger/30': variant === 'danger',
          'bg-accent/15 text-accent border border-accent/30': variant === 'accent',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
