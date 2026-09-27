import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: ReactNode
  rightSlot?: ReactNode
}

export const TextInput = forwardRef<HTMLInputElement, Props>(function TextInput(
  { className, leftIcon, rightSlot, ...props },
  ref,
) {
  return (
    <div className="relative">
      {leftIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#62789A]">
          {leftIcon}
        </span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-[8px] border border-[#D8E4F2] bg-white text-[13.5px] text-[#031C45] outline-none transition',
          'placeholder:text-[#62789A]',
          'focus:border-[#0878F9] focus:ring-[3px] focus:ring-[#0878F9]/15',
          leftIcon ? 'pl-9' : 'pl-3',
          rightSlot ? 'pr-9' : 'pr-3',
          className,
        )}
        {...props}
      />
      {rightSlot ? <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span> : null}
    </div>
  )
})
