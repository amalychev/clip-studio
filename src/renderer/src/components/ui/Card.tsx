import { type ReactNode } from 'react'
import { clsx } from 'clsx'

interface Props {
  children: ReactNode
  className?: string
  hover?: boolean
  active?: boolean
  onClick?: () => void
}

export function Card({ children, className, hover, active, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-surface-1 border border-border rounded-xl p-4 transition-all duration-150',
        hover && 'hover:border-accent/50 hover:bg-surface-2 cursor-pointer',
        active && 'border-accent bg-accent/5',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  )
}
