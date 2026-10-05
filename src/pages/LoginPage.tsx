import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrandPanel } from '@/components/login/BrandPanel'
import { LoginCard } from '@/components/login/LoginCard'
import { WindowControls } from '@/components/login/WindowControls'
import { useAppStore } from '@/stores/app'
import { callApi } from '@/utils'

export function LoginPage() {
  const navigate = useNavigate()
  const { setSession, refreshCompany, showToast } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('bizora.rememberEmail')
    if (saved) setEmail(saved)
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Enter your email address')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    if (!password) {
      setError('Enter your password')
      return
    }

    setLoading(true)
    try {
      const user = await callApi(() => window.bizora.login(email.trim(), password))
      if (remember) {
        localStorage.setItem('bizora.rememberEmail', email.trim())
      } else {
        localStorage.removeItem('bizora.rememberEmail')
      }
      setSession({ authenticated: true, locked: false, hasPin: false, user: user as never })
      await refreshCompany()
      showToast('Signed in successfully', 'success')
      navigate('/sales/new')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[#F5F9FF]">
      <div
        className="absolute left-0 right-[132px] top-0 z-40 h-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <BrandPanel />

      <section className="relative flex h-full w-[47%] min-w-0 flex-col">
        {/* Soft pale-blue geometric background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#F5F9FF]">
          <div className="absolute -right-24 -top-28 h-[420px] w-[420px] rounded-full bg-[#EAF4FF]" />
          <div className="absolute -bottom-40 -left-20 h-[480px] w-[480px] rounded-full border-[48px] border-[#EAF4FF]/70" />
          <div className="absolute right-[-10%] top-[35%] h-[360px] w-[360px] rounded-full border-[36px] border-[#EAF4FF]/55" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-[#F5F9FF]" />
        </div>

        <div className="relative z-50 flex justify-end">
          <WindowControls />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center px-8 pb-8 pt-2">
          <div className="flex w-full flex-1 items-start justify-center pt-[6vh]">
            <LoginCard
              email={email}
              password={password}
              remember={remember}
              error={error}
              loading={loading}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onRememberChange={setRemember}
              onClearError={() => setError(null)}
              onSubmit={(e) => void onSubmit(e)}
              onCreateCompany={() => navigate('/register')}
            />
          </div>
          <div className="text-[12px] text-[#62789A]">Version 1.8.1</div>
        </div>
      </section>
    </div>
  )
}
