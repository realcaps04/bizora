import { ArrowRight, Building2, Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils'

export function PrimaryButton({
  loading,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      className={cn(
        'inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#0878F9] text-[13.5px] font-semibold text-white transition',
        'hover:bg-[#0666d6] disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
      {...props}
      disabled={loading || props.disabled}
      type={props.type ?? 'submit'}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : null}
      {children}
      {!loading ? <ArrowRight size={15} strokeWidth={2} /> : null}
    </button>
  )
}

export function CreateCompanyButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#D8E4F2] bg-white text-[13.5px] font-semibold text-[#031C45] transition',
        'hover:border-[#0878F9]/40 hover:bg-[#F5F9FF]',
        className,
      )}
      {...props}
    >
      <Building2 size={15} strokeWidth={1.75} className="text-[#0878F9]" />
      Create a New Company
    </button>
  )
}
