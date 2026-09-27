import { FileText, Package, BarChart3, Users, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { BizoraLogo } from './BizoraLogo'
import { FeatureItem } from './FeatureItem'

type Feature = {
  title: string
  description: string
  icon: ReactNode
}

const loginFeatures: Feature[] = [
  {
    title: 'Billing & Invoicing',
    description: 'Fast, professional invoicing',
    icon: <FileText size={15} strokeWidth={1.75} />,
  },
  {
    title: 'Inventory Management',
    description: 'Track stock with ease',
    icon: <Package size={15} strokeWidth={1.75} />,
  },
  {
    title: 'Business Reports',
    description: 'Get clear insights',
    icon: <BarChart3 size={15} strokeWidth={1.75} />,
  },
  {
    title: 'Staff Management',
    description: 'Work together securely',
    icon: <Users size={15} strokeWidth={1.75} />,
  },
]

export const registerFeatures: Feature[] = [
  {
    title: 'Complete Business Setup',
    description: 'Configure your company details',
    icon: <FileText size={15} strokeWidth={1.75} />,
  },
  {
    title: 'Add Your Team',
    description: 'Create staff accounts with roles',
    icon: <Users size={15} strokeWidth={1.75} />,
  },
  {
    title: 'Start Billing',
    description: 'Manage sales, purchases and stock',
    icon: <Package size={15} strokeWidth={1.75} />,
  },
  {
    title: 'Grow Your Business',
    description: 'Get clear reports and insights',
    icon: <BarChart3 size={15} strokeWidth={1.75} />,
  },
]

export function BrandPanel({
  headline = (
    <>
      <span className="block text-white">Simple Billing.</span>
      <span className="block text-[#1597FF]">Smarter Business.</span>
    </>
  ),
  description = (
    <>
      Manage sales, purchases, inventory, expenses
      <br />
      and more — all in one powerful desktop app.
    </>
  ),
  features = loginFeatures,
}: {
  headline?: ReactNode
  description?: ReactNode
  features?: Feature[]
}) {
  return (
    <aside className="relative flex h-full w-[53%] min-w-0 flex-col overflow-hidden bg-[#031C45] text-white">
      <div
        className="absolute inset-0 bg-cover bg-[center_right]"
        style={{ backgroundImage: "url('/loin_bg.png')" }}
      />
      <div className="absolute inset-0 bg-[#031C45]/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#031C45]/88 via-[#031C45]/50 to-[#031C45]/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#031C45]/45 via-transparent to-[#031C45]/30" />

      <div className="relative z-10 flex h-full flex-col px-9 pb-7 pt-8 xl:px-11">
        <BizoraLogo variant="light" size="md" />

        <h1 className="mt-5 max-w-[360px] text-[24px] font-bold leading-[1.15] tracking-tight xl:mt-6 xl:text-[28px]">
          {headline}
        </h1>

        <p className="mt-2.5 max-w-[320px] text-[13.5px] leading-relaxed text-[#D5E6FB] xl:mt-3">
          {description}
        </p>

        <div className="mt-5 flex max-w-[300px] flex-col gap-3 xl:mt-6 xl:gap-3.5">
          {features.map((f) => (
            <FeatureItem key={f.title} icon={f.icon} title={f.title} description={f.description} />
          ))}
        </div>

        <div className="relative z-10 mt-auto max-w-[280px] pt-8">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white">
            <Lock size={13} strokeWidth={1.75} className="shrink-0" />
            Your Business. Your Data. Your Control.
          </div>
          <div className="mt-1 pl-[21px] text-[12px] text-[#9FC0EA]">100% Offline. Secure. Reliable.</div>
        </div>
      </div>
    </aside>
  )
}
