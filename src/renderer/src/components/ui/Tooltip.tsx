import { type ReactNode, useState } from 'react'
import { clsx } from 'clsx'

interface Props {
  content: string
  children: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ content, children, placement = 'top' }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={clsx(
            'absolute z-50 px-2.5 py-1.5 text-xs bg-surface-3 border border-border text-white rounded-md whitespace-nowrap shadow-lg pointer-events-none animate-fade-in',
            {
              'bottom-full left-1/2 -translate-x-1/2 mb-2': placement === 'top',
              'top-full left-1/2 -translate-x-1/2 mt-2': placement === 'bottom',
              'right-full top-1/2 -translate-y-1/2 mr-2': placement === 'left',
              'left-full top-1/2 -translate-y-1/2 ml-2': placement === 'right',
            }
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
