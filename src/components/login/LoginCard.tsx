import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Mail, X } from 'lucide-react'
import { BizoraLogo } from './BizoraLogo'
import { TextInput } from './TextInput'
import { PasswordInput } from './PasswordInput'
import { RememberDevice } from './RememberDevice'
import { CreateCompanyButton, PrimaryButton } from './Buttons'
import { Button, Modal } from '@/components/ui'
import { callApi } from '@/utils'

const SUPPORT_EMAIL = 'consoleprojectsonline@gmail.com'

export function LoginCard({
  email,
  password,
  remember,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  onClearError,
  onSubmit,
  onCreateCompany,
}: {
  email: string
  password: string
  remember: boolean
  error: string | null
  loading: boolean
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onRememberChange: (v: boolean) => void
  onClearError: () => void
  onSubmit: (e: FormEvent) => void
  onCreateCompany: () => void
}) {
  const [issueOpen, setIssueOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  return (
    <div className="w-full max-w-[380px] rounded-[16px] border border-[#D8E4F2] bg-white px-6 py-6 shadow-[0_14px_40px_rgba(6,41,92,0.07)]">
      <div className="flex flex-col items-center">
        <BizoraLogo variant="dark" size="sm" centered />
        <h2 className="mt-4 text-[18px] font-bold tracking-tight text-[#031C45]">Welcome Back</h2>
        <p className="mt-1 text-[13.5px] text-[#62789A]">Sign in to continue to your workspace</p>
      </div>

      <form className="mt-5 space-y-3" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="login-email" className="sr-only">
            Email address
          </label>
          <TextInput
            id="login-email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            leftIcon={<Mail size={16} strokeWidth={1.75} />}
          />
        </div>

        <div>
          <label htmlFor="login-password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-[12.5px] font-medium text-[#0878F9] hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <div className="pt-1">
          <RememberDevice checked={remember} onChange={onRememberChange} />
        </div>

        <PrimaryButton type="submit" loading={loading} className="mt-0.5">
          Sign In
        </PrimaryButton>
      </form>

      <Divider>or</Divider>

      <CreateCompanyButton onClick={onCreateCompany} />

      <button
        type="button"
        onClick={() => setIssueOpen(true)}
        className="mt-3 w-full text-center text-[12.5px] text-[#62789A] hover:text-[#0878F9] hover:underline"
      >
        Issue with login?
      </button>

      <LoginIssueModal open={issueOpen} onClose={() => setIssueOpen(false)} loginEmail={email} />
      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} loginEmail={email} />
      <SignInErrorPopup message={error} onClose={onClearError} />
    </div>
  )
}

function SignInErrorPopup({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#031C45]/35 p-4"
      onMouseDown={onClose}
    >
      <div
        role="alertdialog"
        aria-labelledby="signin-error-title"
        className="w-full max-w-[380px] overflow-hidden rounded-[14px] border border-[#D8E4F2] bg-white shadow-[0_18px_50px_rgba(3,28,69,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pb-1 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id="signin-error-title" className="text-[15px] font-semibold tracking-tight text-[#031C45]">
              Unable to sign in
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#62789A]">{message}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-[#94A3B8] hover:bg-[#F5F7FA] hover:text-[#031C45]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex justify-end px-5 py-4">
          <Button type="button" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}

function LoginIssueModal({
  open,
  onClose,
  loginEmail,
}: {
  open: boolean
  onClose: () => void
  loginEmail: string
}) {
  const [name, setName] = useState('')
  const [contactEmail, setContactEmail] = useState(loginEmail)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setContactEmail(loginEmail)
      setFormError(null)
    }
  }, [open, loginEmail])

  function resetAndClose() {
    setName('')
    setContactEmail(loginEmail)
    setMessage('')
    setFormError(null)
    onClose()
  }

  function sendEmail() {
    setFormError(null)
    if (!message.trim()) {
      setFormError('Please describe the login issue')
      return
    }

    const subject = encodeURIComponent('Bizora login issue')
    const body = encodeURIComponent(
      [
        `Name: ${name.trim() || '—'}`,
        `Contact email: ${contactEmail.trim() || '—'}`,
        '',
        'Issue:',
        message.trim(),
        '',
        '— Sent from Bizora desktop app',
      ].join('\n'),
    )

    window.open(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`, '_blank')
    resetAndClose()
  }

  return (
    <Modal
      open={open}
      title="Report a login issue"
      onClose={resetAndClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button type="button" onClick={sendEmail}>
            Send email
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-muted">
        Describe your problem and we will open your email app to send it to{' '}
        <span className="font-medium text-ink">{SUPPORT_EMAIL}</span>.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-ink-muted">Your name</label>
          <input
            className="h-9 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-ink-muted">Your email</label>
          <input
            type="email"
            className="h-9 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-ink-muted">Describe the issue</label>
          <textarea
            rows={4}
            className="w-full rounded-md border border-border-strong bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happens when you try to sign in?"
          />
        </div>
        {formError ? <p className="text-[13px] text-danger">{formError}</p> : null}
      </div>
    </Modal>
  )
}

function ForgotPasswordModal({
  open,
  onClose,
  loginEmail,
}: {
  open: boolean
  onClose: () => void
  loginEmail: string
}) {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email')
  const [contactEmail, setContactEmail] = useState(loginEmail)
  const [code, setCode] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setStep('email')
      setContactEmail(loginEmail)
      setCode('')
      setNextPassword('')
      setConfirmPassword('')
      setFormError(null)
      setBusy(false)
    }
  }, [open, loginEmail])

  function resetAndClose() {
    setFormError(null)
    setBusy(false)
    onClose()
  }

  async function sendCode() {
    const address = contactEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setFormError('Enter the email address on your account')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await callApi(() => window.bizora.requestPasswordReset(address))
      setStep('code')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to send the reset code')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    if (!/^\d{6}$/.test(code.trim())) {
      setFormError('Enter the 6-digit code from your email')
      return
    }
    if (nextPassword.trim().length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }
    if (nextPassword !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await callApi(() => window.bizora.completePasswordReset(contactEmail.trim(), code.trim(), nextPassword))
      setStep('done')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to reset the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Forgot password"
      onClose={resetAndClose}
      footer={
        <>
          {step === 'done' ? null : (
            <Button type="button" variant="outline" onClick={resetAndClose} disabled={busy}>
              Cancel
            </Button>
          )}
          {step === 'done' ? (
            <Button type="button" onClick={resetAndClose}>
              Back to sign in
            </Button>
          ) : step === 'email' ? (
            <Button type="button" onClick={() => void sendCode()} disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          ) : (
            <Button type="button" onClick={() => void savePassword()} disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </Button>
          )}
        </>
      }
    >
      {step === 'done' ? (
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Password updated. Sign in with the new password for{' '}
          <span className="font-medium text-ink">{contactEmail.trim()}</span>.
        </p>
      ) : step === 'email' ? (
        <>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Enter the email on your Bizora account. If it is registered, a 6-digit code is sent to that inbox.
          </p>
          <div className="mt-4">
            <label className="mb-1 block text-[12px] font-medium text-ink-muted">Account email</label>
            <input
              type="email"
              autoFocus
              className="h-9 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Enter the code sent to <span className="font-medium text-ink">{contactEmail.trim()}</span> and choose a new password.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-ink-muted">Reset code</label>
              <input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                className="h-9 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] tracking-[0.2em] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-ink-muted">New password</label>
              <input
                type="password"
                className="h-9 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-ink-muted">Confirm password</label>
              <input
                type="password"
                className="h-9 w-full rounded-md border border-border-strong bg-white px-2.5 text-[13px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </>
      )}
      {formError ? <p className="mt-3 text-[13px] text-danger">{formError}</p> : null}
    </Modal>
  )
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-[#D8E4F2]" />
      <span className="text-[13px] text-[#62789A]">{children}</span>
      <div className="h-px flex-1 bg-[#D8E4F2]" />
    </div>
  )
}
