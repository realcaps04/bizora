import type { ReactNode } from 'react'

export function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#0878F9]/35 text-white backdrop-blur-[2px]">
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="text-[13.5px] font-semibold leading-tight text-white">{title}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-[#B7D0F5]">{description}</div>
      </div>
    </div>
  )
}
