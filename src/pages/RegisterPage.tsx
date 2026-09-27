import { useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react'
import { BrandPanel, registerFeatures } from '@/components/login/BrandPanel'
import { WindowControls } from '@/components/login/WindowControls'
import { TextInput } from '@/components/login/TextInput'
import { PasswordInput } from '@/components/login/PasswordInput'
import { PrimaryButton } from '@/components/login/Buttons'
import { cn, callApi } from '@/utils'
import { useAppStore } from '@/stores/app'

const schema = z
  .object({
    ownerName: z.string().min(2, 'Owner name is required'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    companyName: z.string().min(2, 'Company name is required'),
    businessType: z.string().optional(),
    mobile: z.string().optional(),
    companyEmail: z.string().optional(),
    gstin: z.string().optional(),
    address: z.string().optional(),
    currency: z.string().default('INR'),
    invoicePrefix: z.string().default('INV'),
    taxMode: z.string().default('gst'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

const steps = [
  { label: 'Account', title: 'Account Details', hint: 'Create your owner account to access your business workspace.' },
  { label: 'Business', title: 'Business Details', hint: 'Tell us about your company so we can set up your workspace.' },
  { label: 'Preferences', title: 'Preferences', hint: 'Choose billing defaults for invoices and tax.' },
  { label: 'Finish', title: 'You are all set', hint: 'Review and enter your new Bizora workspace.' },
]

export function RegisterPage() {
  const navigate = useNavigate()
  const { setSession, refreshCompany, showToast, bootstrap } = useAppStore()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: 'INR',
      invoicePrefix: 'INV',
      taxMode: 'gst',
      businessType: 'Retail',
    },
  })

  async function finish(values: FormValues) {
    setError(null)
    try {
      const user = await callApi(() =>
        window.bizora.register({
          ownerName: values.ownerName,
          email: values.email,
          password: values.password,
          companyName: values.companyName,
          businessType: values.businessType,
          mobile: values.mobile,
          companyEmail: values.companyEmail || values.email,
          gstin: values.gstin,
          address: values.address,
          currency: values.currency,
          invoicePrefix: values.invoicePrefix,
          taxMode: values.taxMode,
        }),
      )
      setSession({ authenticated: true, locked: false, hasPin: false, user: user as never })
      await bootstrap()
      await refreshCompany()
      showToast('Workspace ready', 'success')
      navigate('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create company')
    }
  }

  async function next() {
    const fields: (keyof FormValues)[][] = [
      ['ownerName', 'email', 'password', 'confirmPassword'],
      ['companyName', 'businessType', 'mobile', 'gstin', 'address'],
      ['currency', 'invoicePrefix', 'taxMode'],
    ]
    if (step < 3) {
      const ok = await form.trigger(fields[step])
      if (ok) setStep((s) => s + 1)
      return
    }
    await form.handleSubmit(finish)()
  }

  const current = steps[step]
  const fieldError = Object.values(form.formState.errors)[0]?.message as string | undefined

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-[#F5F9FF]">
      <div
        className="absolute left-0 right-[132px] top-0 z-40 h-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <BrandPanel
        headline={
          <>
            <span className="block text-white">Your Company Workspace</span>
            <span className="block text-[#1597FF]">Starts Here.</span>
          </>
        }
        description="Set up your business workspace in a few simple steps and start managing your operations with Bizora."
        features={registerFeatures}
      />

      <section className="relative flex h-full w-[47%] min-w-0 flex-col">
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#F5F9FF]">
          <div className="absolute -right-24 -top-28 h-[420px] w-[420px] rounded-full bg-[#EAF4FF]" />
          <div className="absolute -bottom-40 -left-20 h-[480px] w-[480px] rounded-full border-[48px] border-[#EAF4FF]/70" />
          <div className="absolute right-[-10%] top-[35%] h-[360px] w-[360px] rounded-full border-[36px] border-[#EAF4FF]/55" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-[#F5F9FF]" />
        </div>

        <div className="relative z-50 flex justify-end">
          <WindowControls />
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center overflow-y-auto px-6 pb-6 pt-1">
          <div className="flex w-full flex-1 items-start justify-center pt-[3vh]">
            <div className="w-full max-w-[420px] rounded-[16px] border border-[#D8E4F2] bg-white px-6 py-6 shadow-[0_14px_40px_rgba(6,41,92,0.07)]">
              <h2 className="text-[18px] font-bold tracking-tight text-[#031C45]">
                Create Your Company Workspace
              </h2>
              <p className="mt-1 text-[13px] text-[#62789A]">
                Set up your account and business details to get started with Bizora.
              </p>

              <StepIndicator step={step} />

              <div className="mt-5">
                <h3 className="text-[14px] font-semibold text-[#031C45]">{current.title}</h3>
                <p className="mt-0.5 text-[12.5px] text-[#62789A]">{current.hint}</p>
              </div>

              <div className="mt-4 space-y-3">
                {step === 0 && (
                  <>
                    <LabeledField label="Owner Name">
                      <TextInput
                        placeholder="Enter your full name"
                        leftIcon={<User size={16} strokeWidth={1.75} />}
                        {...form.register('ownerName')}
                      />
                    </LabeledField>
                    <LabeledField label="Email Address">
                      <TextInput
                        type="email"
                        placeholder="Enter your email address"
                        leftIcon={<Mail size={16} strokeWidth={1.75} />}
                        {...form.register('email')}
                      />
                    </LabeledField>
                    <LabeledField label="Password">
                      <PasswordInput placeholder="Create a password" {...form.register('password')} />
                    </LabeledField>
                    <LabeledField label="Confirm Password">
                      <PasswordInput placeholder="Confirm your password" {...form.register('confirmPassword')} />
                    </LabeledField>
                  </>
                )}

                {step === 1 && (
                  <>
                    <LabeledField label="Company Name">
                      <TextInput
                        placeholder="Enter your company name"
                        leftIcon={<Building2 size={16} strokeWidth={1.75} />}
                        {...form.register('companyName')}
                      />
                    </LabeledField>
                    <LabeledField label="Business Type">
                      <SelectField {...form.register('businessType')}>
                        <option>Retail</option>
                        <option>Wholesale</option>
                        <option>Services</option>
                        <option>Manufacturing</option>
                        <option>Other</option>
                      </SelectField>
                    </LabeledField>
                    <LabeledField label="Mobile">
                      <TextInput
                        placeholder="Enter mobile number"
                        leftIcon={<Phone size={16} strokeWidth={1.75} />}
                        {...form.register('mobile')}
                      />
                    </LabeledField>
                    <LabeledField label="GSTIN (optional)">
                      <TextInput placeholder="Enter GSTIN" {...form.register('gstin')} />
                    </LabeledField>
                    <LabeledField label="Business Email">
                      <TextInput
                        type="email"
                        placeholder="company@example.com"
                        leftIcon={<Mail size={16} strokeWidth={1.75} />}
                        {...form.register('companyEmail')}
                      />
                    </LabeledField>
                    <LabeledField label="Address">
                      <TextInput
                        placeholder="Business address"
                        leftIcon={<MapPin size={16} strokeWidth={1.75} />}
                        {...form.register('address')}
                      />
                    </LabeledField>
                  </>
                )}

                {step === 2 && (
                  <>
                    <LabeledField label="Currency">
                      <SelectField {...form.register('currency')}>
                        <option value="INR">INR — Indian Rupee</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </SelectField>
                    </LabeledField>
                    <LabeledField label="Tax Configuration">
                      <SelectField {...form.register('taxMode')}>
                        <option value="gst">GST (CGST/SGST/IGST)</option>
                        <option value="none">No tax</option>
                      </SelectField>
                    </LabeledField>
                    <LabeledField label="Invoice Prefix">
                      <TextInput placeholder="INV" {...form.register('invoicePrefix')} />
                    </LabeledField>
                  </>
                )}

                {step === 3 && (
                  <div className="rounded-[12px] border border-[#D8E4F2] bg-[#F5F9FF] px-5 py-8 text-center">
                    <CheckCircle2 className="mx-auto text-[#0878F9]" size={36} strokeWidth={1.5} />
                    <h4 className="mt-3 text-[15px] font-semibold text-[#031C45]">Your workspace is ready</h4>
                    <p className="mt-1.5 text-[13px] text-[#62789A]">
                      Next, add a product, a customer, and create your first invoice.
                    </p>
                  </div>
                )}
              </div>

              {error ? (
                <div className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-600">
                  {error}
                </div>
              ) : null}
              {fieldError ? <div className="mt-3 text-[13px] text-red-600">{fieldError}</div> : null}

              <div className="mt-5 space-y-2.5">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#D8E4F2] bg-white text-[13.5px] font-semibold text-[#031C45] transition hover:bg-[#F5F9FF]"
                  >
                    <ArrowLeft size={15} strokeWidth={2} />
                    Back
                  </button>
                ) : null}
                <PrimaryButton
                  type="button"
                  loading={form.formState.isSubmitting}
                  onClick={() => void next()}
                  disabled={form.formState.isSubmitting}
                >
                  {step === 3 ? 'Enter Bizora' : 'Next'}
                </PrimaryButton>
              </div>

              <p className="mt-4 text-center text-[12.5px] text-[#62789A]">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-[#0878F9] hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mt-5 flex items-center justify-between px-1">
      {steps.map((s, i) => {
        const active = i === step
        const done = i < step
        return (
          <div key={s.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition',
                  active || done
                    ? 'bg-[#0878F9] text-white'
                    : 'border border-[#D8E4F2] bg-white text-[#62789A]',
                )}
              >
                {i + 1}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  active ? 'text-[#031C45]' : 'text-[#62789A]',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div
                className={cn(
                  'mx-1 mb-5 h-px flex-1',
                  done ? 'bg-[#0878F9]' : 'bg-[#D8E4F2]',
                )}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[#62789A]">{label}</span>
      {children}
    </label>
  )
}

function SelectField({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-[8px] border border-[#D8E4F2] bg-white px-3 text-[13.5px] text-[#031C45] outline-none transition',
        'focus:border-[#0878F9] focus:ring-[3px] focus:ring-[#0878F9]/15',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}
