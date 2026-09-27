import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { BrandLogo } from '@/components/BrandLogo'
import { BizoraLogo } from '@/components/login/BizoraLogo'
import { WindowControls } from '@/components/login/WindowControls'
import { useAppStore } from '@/stores/app'
import { callApi, cn } from '@/utils'

export function LockScreen() {
  const { user, companyName, setSession, showToast } = useAppStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function unlock() {
    setBusy(true)
    setError(null)
    try {
      const sessionUser = await callApi(() => window.bizora.unlock(pin))
      setSession({ authenticated: true, locked: false, hasPin: true, user: sessionUser as never })
      showToast('Unlocked', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center bg-[#0a192f] px-4">
      <div className="absolute right-0 top-0 z-50">
        <WindowControls />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#12253f] p-8 text-center text-white">
        <BrandLogo size="lg" className="mx-auto justify-center" />
        <div className="mt-4 text-sm text-slate-300">{companyName || 'Workspace'}</div>
        <h1 className="mt-5 text-lg font-semibold">Application Locked</h1>
        <p className="mt-2 text-sm text-slate-400">Enter your PIN to continue as {user?.name}</p>
        <p className="mt-1 text-[12px] text-slate-500">Default PIN is 0000 if you have not set one.</p>
        <Input
          className="mt-6 text-center text-lg tracking-[0.4em]"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pin.length >= 4) void unlock()
          }}
          autoFocus
        />
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <Button className="mt-5 w-full" disabled={busy || pin.length < 4} onClick={() => void unlock()}>
          Unlock
        </Button>
      </div>
    </div>
  )
}

const onboardingSteps = [
  {
    n: '1',
    title: 'Add your first product',
    description: 'Set up items with rates, tax and stock.',
    to: '/products',
  },
  {
    n: '2',
    title: 'Add your first customer',
    description: 'Save customer details for faster billing.',
    to: '/customers',
  },
  {
    n: '3',
    title: 'Create your first invoice',
    description: 'Make a sale and generate a professional invoice.',
    to: '/sales/new',
  },
]

export function OnboardingPage() {
  const navigate = useNavigate()

  return (
    <div className="relative -m-5 flex min-h-[calc(100%+2.5rem)] flex-col overflow-hidden bg-[#F3F6FB]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#EAF4FF]" />
        <div className="absolute -bottom-32 -right-20 h-[420px] w-[420px] rounded-full border-[40px] border-[#EAF4FF]/80" />
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[520px]">
          <div className="mb-6 flex flex-col items-center text-center">
            <BizoraLogo variant="dark" size="md" centered showSubtitle={false} />
            <h1 className="mt-4 text-[22px] font-bold tracking-tight text-[#031C45]">
              Get started with Bizora
            </h1>
            <p className="mt-1.5 text-[13.5px] text-[#62789A]">
              Complete these steps to begin billing.
            </p>
          </div>

          <div className="space-y-3">
            {onboardingSteps.map((step) => (
              <button
                key={step.n}
                type="button"
                onClick={() => navigate(step.to)}
                className={cn(
                  'group flex w-full items-center gap-4 rounded-[12px] border border-[#D8E4F2] bg-white px-4 py-4 text-left shadow-[0_4px_16px_rgba(6,41,92,0.04)] transition',
                  'hover:border-[#0878F9]/35 hover:bg-[#F8FBFF] hover:shadow-[0_8px_24px_rgba(8,120,249,0.08)]',
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EAF4FF] text-[14px] font-bold text-[#0878F9]">
                  {step.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-[#031C45]">{step.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-[#62789A]">{step.description}</span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#0878F9] opacity-0 transition group-hover:bg-[#EAF4FF] group-hover:opacity-100">
                  <ArrowRight size={16} strokeWidth={2} />
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate('/sales/new')}
              className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[#D8E4F2] bg-white px-4 text-[13px] font-medium text-[#031C45] transition hover:border-[#0878F9]/30 hover:bg-[#F5F9FF]"
            >
              Skip Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
