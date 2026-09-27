import { cn } from '@/utils'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'h-7 px-2.5 text-[13px]',
        size === 'md' && 'h-8 px-3 text-[13px]',
        size === 'lg' && 'h-9 px-3.5 text-[13px]',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-hover',
        variant === 'secondary' && 'bg-slate-900 text-white hover:bg-slate-800',
        variant === 'outline' && 'border border-border-strong bg-white text-ink hover:bg-slate-50',
        variant === 'ghost' && 'text-ink-muted hover:bg-slate-100 hover:text-ink',
        variant === 'danger' && 'bg-danger text-white hover:bg-red-700',
        className,
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-8 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none transition',
        'placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/15',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none',
        'focus:border-brand focus:ring-2 focus:ring-brand/15',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-border-strong bg-white px-3 py-2 text-sm text-ink outline-none',
        'placeholder:text-ink-subtle focus:border-brand focus:ring-2 focus:ring-brand/15',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn('mb-1.5 block text-xs font-medium text-ink-muted', className)}>{children}</label>
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-border bg-white', className)}>{children}</div>
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-medium',
        tone === 'success' && 'bg-emerald-50 text-emerald-700',
        tone === 'warning' && 'bg-amber-50 text-amber-700',
        tone === 'danger' && 'bg-red-50 text-red-700',
        tone === 'info' && 'bg-blue-50 text-blue-700',
        tone === 'neutral' && 'bg-slate-100 text-slate-600',
      )}
    >
      {children}
    </span>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  wide,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={cn('max-h-[90vh] w-full overflow-hidden rounded-lg border border-border bg-white shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            Esc
          </button>
        </div>
        <div className="max-h-[calc(90vh-7rem)] overflow-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-white px-6 py-16 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-sm text-ink-muted">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      {label}
    </div>
  )
}

export function Toast({
  message,
  tone,
  onClose,
}: {
  message: string
  tone: 'success' | 'error' | 'info'
  onClose: () => void
}) {
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-[60] max-w-sm rounded-md border border-border bg-white px-4 py-3 shadow-lg">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 h-2 w-2 shrink-0 rounded-full',
            tone === 'success' && 'bg-success',
            tone === 'error' && 'bg-danger',
            tone === 'info' && 'bg-brand',
          )}
        />
        <p className="text-sm text-ink">{message}</p>
        <button type="button" className="ml-auto text-xs text-ink-muted" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
