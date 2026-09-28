import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { BrandLogo } from '@/components/BrandLogo'
import { UpiQr, isUpiId } from '@/components/UpiQr'
import { useAppStore } from '@/stores/app'
import { callApi, formatDateTime, formatMoney } from '@/utils'

export function ReportsPage() {
  const [tab, setTab] = useState<'sales' | 'financial' | 'inventory' | 'tax'>('sales')
  const [from, setFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      let result: unknown
      if (tab === 'sales') result = await callApi(() => window.bizora.reportSales({ from, to }))
      else if (tab === 'financial') result = await callApi(() => window.bizora.reportFinancial({ from, to }))
      else if (tab === 'inventory') result = await callApi(() => window.bizora.reportInventory())
      else result = await callApi(() => window.bizora.reportTax({ from, to }))
      setData(result as Record<string, unknown>)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [tab])

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Sales, financial, inventory and tax summaries"
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            Print / Export PDF
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {(['sales', 'financial', 'inventory', 'tax'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-slate-900 text-white' : 'border border-border bg-white text-ink-muted'}`}
          >
            {t}
          </button>
        ))}
        {tab !== 'inventory' ? (
          <>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Button onClick={() => void load()}>Apply</Button>
          </>
        ) : null}
      </div>

      {loading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {tab === 'sales' ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Object.entries((data.summary as Record<string, number>) || {}).map(([k, v]) => (
                  <Card key={k} className="px-4 py-3">
                    <div className="text-xs capitalize text-ink-muted">{k.replaceAll('_', ' ')}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">
                      {k.includes('count') ? v : formatMoney(Number(v))}
                    </div>
                  </Card>
                ))}
              </div>
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-ink-muted">
                    <tr>
                      <th className="px-4 py-2 text-left">Label</th>
                      <th className="px-4 py-2 text-right">Count</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((data.breakdown as Record<string, unknown>[]) || []).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-2">{String(row.label)}</td>
                        <td className="px-4 py-2 text-right">{Number(row.count)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(row.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          ) : null}

          {tab === 'financial' ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ['Revenue', data.revenue],
                ['Expenses', data.expenses],
                ['Profit', data.profit],
                ['Outstanding', data.outstanding],
              ].map(([label, value]) => (
                <Card key={String(label)} className="px-4 py-3">
                  <div className="text-xs text-ink-muted">{String(label)}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Number(value))}</div>
                </Card>
              ))}
            </div>
          ) : null}

          {tab === 'inventory' ? (
            <>
              <Card className="px-4 py-3 text-sm">
                Low stock items: <strong>{((data.lowStock as unknown[]) || []).length}</strong>
              </Card>
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-ink-muted">
                    <tr>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-right">Stock</th>
                      <th className="px-4 py-2 text-right">Min</th>
                      <th className="px-4 py-2 text-right">Selling Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((data.stock as Record<string, unknown>[]) || []).slice(0, 50).map((p) => (
                      <tr key={String(p.id)} className="border-t border-border">
                        <td className="px-4 py-2">{String(p.name)}</td>
                        <td className="px-4 py-2 text-right">{Number(p.current_stock)}</td>
                        <td className="px-4 py-2 text-right">{Number(p.min_stock)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(Number(p.selling_rate))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          ) : null}

          {tab === 'tax' ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {Object.entries((data.summary as Record<string, number>) || {}).map(([k, v]) => (
                  <Card key={k} className="px-4 py-3">
                    <div className="text-xs text-ink-muted">{k}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(Number(v))}</div>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function BackupPage() {
  const { showToast } = useAppStore()
  const [status, setStatus] = useState<{
    location: string
    lastBackup: { name: string; mtime: string } | null
    backups: { name: string; mtime: string }[]
  } | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const data = await callApi(() => window.bizora.backupStatus())
    setStatus(data as never)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function backupNow() {
    setBusy(true)
    try {
      const result = await callApi(() => window.bizora.createBackup())
      showToast(`Backup created: ${result.name}`, 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    if (!confirm('Restore Backup?\n\nThis will replace the current business database. A safety copy will be kept when possible.')) return
    setBusy(true)
    try {
      const result = await callApi(() => window.bizora.restoreBackup())
      if (!result) {
        showToast('Restore cancelled', 'info')
        return
      }
      const meta = (result as { meta: { createdAt: string; companyName: string } }).meta
      showToast(`Restored data from ${meta.createdAt}`, 'success')
      window.location.reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function exportCategory(category: string) {
    try {
      const result = await callApi(() => window.bizora.exportData(category, 'csv'))
      showToast(`Exported to ${(result as { name: string }).name}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed', 'error')
    }
  }

  if (!status) return <Spinner />

  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="Protect your business data" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="text-xs font-medium text-ink-muted">Last Backup</div>
          <div className="mt-2 text-lg font-semibold">
            {status.lastBackup ? formatDateTime(status.lastBackup.mtime) : 'No backup yet'}
          </div>
          <div className="mt-4 text-xs font-medium text-ink-muted">Backup Location</div>
          <div className="mt-1 break-all text-sm text-ink-muted">{status.location}</div>
          <div className="mt-5">
            <Button disabled={busy} onClick={() => void backupNow()}>
              Backup Now
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Restore Backup</h2>
          <p className="mt-1 text-sm text-ink-muted">Select a .bizora backup file.</p>
          <div className="mt-4 space-y-3">
            <Button variant="secondary" disabled={busy} onClick={() => void restore()}>
              Restore Backup
            </Button>
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Export Business Data</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {['customers', 'products', 'sales', 'purchases', 'invoices', 'expenses', 'payments'].map((c) => (
                <Button key={c} size="sm" variant="outline" onClick={() => void exportCategory(c)}>
                  {c}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {status.backups.length > 0 ? (
        <Card className="mt-4 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Recent Backups</div>
          <table className="w-full text-sm">
            <tbody>
              {status.backups.map((b) => (
                <tr key={b.name} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{b.name}</td>
                  <td className="px-4 py-2 text-ink-muted">{formatDateTime(b.mtime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  )
}

const GST_STATE_CODE = /^(0[1-9]|[1-2][0-9]|3[0-8]|97)$/

function invoiceFieldErrors(
  company: Record<string, unknown>,
  settings: Record<string, string>,
  accountConfirm: string,
  strict: boolean,
) {
  const errors: Record<string, string> = {}
  const prefix = String(company.invoice_prefix || '').trim()
  if (!prefix) {
    if (strict) errors.prefix = 'Enter an invoice prefix'
  } else if (!/^[A-Za-z][A-Za-z0-9/-]{1,11}$/.test(prefix)) {
    errors.prefix = 'Use 2–12 characters, starting with a letter'
  }

  const place = (settings.place_of_supply || '').trim()
  if (!place) {
    if (strict) errors.place = 'Enter the place of supply, such as Kerala (32)'
  } else {
    const match = place.match(/^(.+?)\s*\((\d{2})\)$/)
    if (!match || match[1].trim().length < 2 || !GST_STATE_CODE.test(match[2])) {
      errors.place = 'Use the state and GST code, such as Kerala (32)'
    }
  }

  const accountName = (settings.bank_account_name || '').trim()
  const accountNumber = (settings.bank_account_number || '').replace(/\s/g, '')
  const ifsc = (settings.bank_ifsc || '').trim().toUpperCase()
  const bankName = (settings.bank_name || '').trim()
  const upi = (settings.upi_id || '').trim()
  const bankStarted = Boolean(accountName || accountNumber || ifsc || bankName)

  if (accountName && !/^[A-Za-z][A-Za-z0-9 .&'/,()-]*$/.test(accountName)) {
    errors.accountName = 'Use the name as printed on the account'
  } else if (strict && accountName && accountName.length < 2) {
    errors.accountName = 'Account name must be at least 2 characters'
  }
  if (accountNumber && !/^\d{9,18}$/.test(accountNumber)) {
    errors.accountNumber = 'Account number must be 9 to 18 digits'
  }
  const confirm = accountConfirm.replace(/\D/g, '')
  if (accountNumber && !confirm) {
    if (strict) errors.accountConfirm = 'Re-enter the account number'
  } else if (confirm && confirm !== accountNumber && (strict || confirm.length >= accountNumber.length)) {
    errors.accountConfirm = 'Account numbers do not match'
  }
  if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    errors.ifsc = 'IFSC must be 11 characters, like HDFC0001234'
  }
  if (bankName && !/^[A-Za-z][A-Za-z0-9 .&'()-]*$/.test(bankName)) {
    errors.bankName = 'Enter the bank name using letters and numbers'
  } else if (strict && bankName && bankName.length < 2) {
    errors.bankName = 'Bank name must be at least 2 characters'
  }
  if (upi && !isUpiId(upi)) {
    errors.upi = 'Enter a UPI ID like name@okaxis or shop@hdfcbank'
  }

  if (strict && bankStarted) {
    if (!accountName) errors.accountName ||= 'Enter the account name'
    if (!accountNumber) errors.accountNumber ||= 'Enter the account number'
    if (!ifsc) errors.ifsc ||= 'Enter the IFSC code'
    if (!bankName) errors.bankName ||= 'Enter the bank name'
  }

  return errors
}

export function SettingsPage() {
  const { showToast, user, refreshCompany } = useAppStore()
  const [tab, setTab] = useState('company')
  const [company, setCompany] = useState<Record<string, unknown> | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [invoiceAttempted, setInvoiceAttempted] = useState(false)
  const [accountConfirm, setAccountConfirm] = useState('')
  const [pin, setPin] = useState('')
  const [passwords, setPasswords] = useState({ current: '', next: '' })

  useEffect(() => {
    void Promise.all([
      callApi(() => window.bizora.getCompany()),
      callApi(() => window.bizora.getSettings()),
    ]).then(([c, s]) => {
      setCompany(c as Record<string, unknown>)
      setSettings({ place_of_supply: 'Kerala (32)', ...(s as Record<string, string>) })
    })
  }, [])

  async function saveCompany() {
    if (!company) return
    await callApi(() => window.bizora.updateCompany(company))
    await refreshCompany()
    showToast('Company updated', 'success')
  }

  async function saveSettings() {
    await callApi(() => window.bizora.updateSettings(settings))
    showToast('Settings saved', 'success')
  }

  async function setGoogleDriveChoice(on: boolean) {
    const next = { ...settings, google_drive_backup: on ? 'true' : 'false' }
    setSettings(next)
    try {
      await callApi(() => window.bizora.updateSettings({ google_drive_backup: next.google_drive_backup }))
      if (!on) await callApi(() => window.bizora.disconnectGoogleDrive())
      showToast(on ? 'Google Drive backup is on for this business' : 'Google Drive backup is off', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update Google Drive backup', 'error')
    }
  }

  async function saveInvoiceSettings() {
    if (!company) return
    setInvoiceAttempted(true)
    const nextCompany = {
      ...company,
      invoice_prefix: String(company.invoice_prefix || '').trim().toUpperCase(),
    }
    const nextSettings = {
      ...settings,
      place_of_supply: (settings.place_of_supply || '').trim(),
      bank_account_name: (settings.bank_account_name || '').trim(),
      bank_account_number: (settings.bank_account_number || '').replace(/\D/g, ''),
      bank_ifsc: (settings.bank_ifsc || '').replace(/\s/g, '').toUpperCase(),
      bank_name: (settings.bank_name || '').trim(),
      upi_id: (settings.upi_id || '').trim(),
    }
    const errors = invoiceFieldErrors(nextCompany, nextSettings, accountConfirm, true)
    setCompany(nextCompany)
    setSettings(nextSettings)
    const first = Object.values(errors)[0]
    if (first) {
      showToast(first, 'error')
      return
    }
    await callApi(() => window.bizora.updateCompany(nextCompany))
    await refreshCompany()
    await callApi(() => window.bizora.updateSettings(nextSettings))
    setAccountConfirm(nextSettings.bank_account_number)
    showToast('Invoice settings saved', 'success')
  }

  async function setupPin() {
    try {
      await callApi(() => window.bizora.setupPin(pin))
      showToast('PIN configured', 'success')
      setPin('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to set PIN', 'error')
    }
  }

  async function changePassword() {
    try {
      await callApi(() => window.bizora.changePassword(passwords.current, passwords.next))
      showToast('Password changed', 'success')
      setPasswords({ current: '', next: '' })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to change password', 'error')
    }
  }

  if (!company) return <Spinner />

  const invoiceErrors = invoiceFieldErrors(company, settings, accountConfirm, invoiceAttempted)
  const invalidInput = 'border-red-500 focus:border-red-500 focus:ring-red-500/15'

  const tabs = [
    { id: 'company', label: 'Company' },
    { id: 'invoice', label: 'Invoice' },
    { id: 'security', label: 'Security' },
    { id: 'backup', label: 'Backup' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'updates', label: 'Updates' },
    { id: 'audit', label: 'Audit Log' },
  ]

  return (
    <div>
      <PageHeader title="Settings" subtitle={`Signed in as ${user?.name}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-slate-900 text-white' : 'border border-border bg-white text-ink-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' ? (
        <Card className="max-w-2xl space-y-3 p-5">
          <Field label="Company Name">
            <Input value={String(company.name || '')} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
          </Field>
          <Field label="Owner Name">
            <Input value={String(company.owner_name || '')} onChange={(e) => setCompany({ ...company, owner_name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={String(company.email || '')} onChange={(e) => setCompany({ ...company, email: e.target.value })} />
          </Field>
          <Field label="Mobile">
            <Input value={String(company.mobile || '')} onChange={(e) => setCompany({ ...company, mobile: e.target.value })} />
          </Field>
          <Field label="GSTIN">
            <Input value={String(company.gstin || '')} onChange={(e) => setCompany({ ...company, gstin: e.target.value })} />
          </Field>
          <Field label="Address">
            <Input value={String(company.address || '')} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
          </Field>
          <Button onClick={() => void saveCompany()}>Save Company</Button>
        </Card>
      ) : null}

      {tab === 'invoice' ? (
        <Card className="max-w-4xl p-5">
          <div className="grid items-start gap-6 md:grid-cols-2">
          <div className="space-y-3">
          <Field label="Invoice Prefix" error={invoiceErrors.prefix}>
            <Input
              value={String(company.invoice_prefix || '')}
              maxLength={12}
              placeholder="INV"
              className={invoiceErrors.prefix ? invalidInput : ''}
              onChange={(e) => setCompany({ ...company, invoice_prefix: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Tax Mode">
            <Select value={String(company.tax_mode || 'gst')} onChange={(e) => setCompany({ ...company, tax_mode: e.target.value })}>
              <option value="gst">GST</option>
              <option value="none">None</option>
            </Select>
          </Field>
          <Field label="Paper Format">
            <Select value={settings.paper_format || 'A4'} onChange={(e) => setSettings({ ...settings, paper_format: e.target.value })}>
              <option value="A4">A4</option>
              <option value="thermal">Thermal</option>
            </Select>
          </Field>
          <Field label="Place of Supply (PDF)" error={invoiceErrors.place}>
            <Input
              value={settings.place_of_supply ?? ''}
              placeholder="Kerala (32)"
              className={invoiceErrors.place ? invalidInput : ''}
              onChange={(e) => setSettings({ ...settings, place_of_supply: e.target.value })}
            />
          </Field>
          </div>
          <div className="space-y-3 md:border-l md:border-border md:pl-6">
            <div className="text-sm font-semibold">Bank Details (PDF)</div>
              <Field label="Account Name" error={invoiceErrors.accountName}>
                <Input
                  value={settings.bank_account_name || ''}
                  maxLength={80}
                  placeholder="Name on the account"
                  className={invoiceErrors.accountName ? invalidInput : ''}
                  onChange={(e) => setSettings({ ...settings, bank_account_name: e.target.value })}
                />
              </Field>
              <Field label="Account Number" error={invoiceErrors.accountNumber}>
                <Input
                  value={settings.bank_account_number || ''}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={18}
                  placeholder="9 to 18 digits"
                  className={invoiceErrors.accountNumber ? invalidInput : ''}
                  onChange={(e) =>
                    setSettings({ ...settings, bank_account_number: e.target.value.replace(/\D/g, '').slice(0, 18) })
                  }
                />
              </Field>
              <Field label="Re-enter Account Number" error={invoiceErrors.accountConfirm}>
                <Input
                  value={accountConfirm}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={18}
                  placeholder="Type the account number again"
                  className={invoiceErrors.accountConfirm ? invalidInput : ''}
                  onChange={(e) => setAccountConfirm(e.target.value.replace(/\D/g, '').slice(0, 18))}
                  onPaste={(e) => e.preventDefault()}
                />
              </Field>
              <Field label="IFSC Code" error={invoiceErrors.ifsc}>
                <Input
                  value={settings.bank_ifsc || ''}
                  maxLength={11}
                  placeholder="HDFC0001234"
                  className={invoiceErrors.ifsc ? invalidInput : ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      bank_ifsc: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11),
                    })
                  }
                />
              </Field>
              <Field label="Bank Name" error={invoiceErrors.bankName}>
                <Input
                  value={settings.bank_name || ''}
                  maxLength={60}
                  placeholder="Bank name"
                  className={invoiceErrors.bankName ? invalidInput : ''}
                  onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
                />
              </Field>
              <Field label="UPI ID" error={invoiceErrors.upi}>
                <Input
                  value={settings.upi_id || ''}
                  placeholder="name@okaxis"
                  className={invoiceErrors.upi ? invalidInput : ''}
                  onChange={(e) => setSettings({ ...settings, upi_id: e.target.value.replace(/\s/g, '') })}
                />
              </Field>
              {isUpiId(settings.upi_id || '') ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 p-3">
                  <UpiQr upiId={settings.upi_id} payeeName={String(company.name || '')} size={132} />
                  <div className="text-[12px] text-ink-muted">
                    <div className="font-medium text-ink">Scan to pay</div>
                    <div>{settings.upi_id}</div>
                    <div className="mt-1">Invoices include this QR with the bill amount.</div>
                  </div>
                </div>
              ) : null}
          </div>
          </div>
          <Button className="mt-4" onClick={() => void saveInvoiceSettings()}>
            Save Invoice Settings
          </Button>
        </Card>
      ) : null}

      {tab === 'security' ? (
        <div className="grid max-w-3xl gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">Change Password</h2>
            <Field label="Current Password">
              <Input type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
            </Field>
            <Field label="New Password">
              <Input type="password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
            </Field>
            <Button onClick={() => void changePassword()}>Update Password</Button>
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">Quick Unlock PIN</h2>
            <p className="text-[12px] text-ink-muted">Default PIN is 0000 until you change it.</p>
            <Field label="4–6 digit PIN">
              <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="0000" />
            </Field>
            <Field label="Auto-lock">
              <Select
                value={settings.auto_lock_minutes || '0'}
                onChange={(e) => setSettings({ ...settings, auto_lock_minutes: e.target.value })}
              >
                <option value="0">Never (only manual lock)</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => void setupPin()}>Save PIN</Button>
              <Button variant="outline" onClick={() => void saveSettings()}>
                Save Auto-lock
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'backup' ? (
        <div className="max-w-3xl space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">Backup on this computer</h2>
            <p className="text-sm text-ink-muted">
              Backup Now saves a BusinessBackup file in the folder below. If Google Drive is on, that same file is uploaded to the connected account.
            </p>
            <LocalBackupCard />
            <ImportBackupCard />
            <Field label="Backup Schedule">
              <Select value={settings.backup_schedule || 'daily'} onChange={(e) => setSettings({ ...settings, backup_schedule: e.target.value })}>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="manual">Manual only</option>
              </Select>
            </Field>
            <p className="text-xs text-ink-muted">
              Every day or every week, while Bizora is open, a new backup file is saved in that folder. If Google Drive is on, it is uploaded too.
            </p>
            <Button onClick={() => void saveSettings()}>Save</Button>
          </Card>
          <Card className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <img
                src={`${import.meta.env.BASE_URL}google-drive.svg`}
                alt="Google Drive"
                width={32}
                height={32}
                className="mt-0.5 h-8 w-8 shrink-0"
              />
              <label className="flex min-w-0 flex-1 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={settings.google_drive_backup === 'true'}
                  onChange={(e) => void setGoogleDriveChoice(e.target.checked)}
                />
                <span>
                  <span className="text-sm font-semibold">Google Drive backup</span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    Optional. Leave this off and the backup stays only in the folder above. Turn it on to upload that file to this business’s Google Drive.
                  </span>
                </span>
              </label>
            </div>
            {settings.google_drive_backup === 'true' ? <GoogleDrivePanel /> : null}
          </Card>
        </div>
      ) : null}

      {tab === 'appearance' ? (
        <Card className="max-w-xl space-y-3 p-5">
          <Field label="Theme">
            <Select value={settings.theme || 'light'} onChange={(e) => setSettings({ ...settings, theme: e.target.value })}>
              <option value="light">Light</option>
            </Select>
          </Field>
          <Field label="Compact Mode">
            <Select value={settings.compact_mode || 'false'} onChange={(e) => setSettings({ ...settings, compact_mode: e.target.value })}>
              <option value="false">Standard</option>
              <option value="true">Compact</option>
            </Select>
          </Field>
          <Field label="Font Size">
            <Select value={settings.font_size || 'medium'} onChange={(e) => setSettings({ ...settings, font_size: e.target.value })}>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </Select>
          </Field>
          <Button onClick={() => void saveSettings()}>Save Appearance</Button>
        </Card>
      ) : null}

      {tab === 'updates' ? <UpdatesPanel /> : null}

      {tab === 'audit' ? <AuditPanel /> : null}
    </div>
  )
}

function ImportBackupCard() {
  const { showToast } = useAppStore()
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)

  async function importBackup() {
    if (
      !confirm(
        'Add this backup to the data already in Bizora?\n\nNothing already here is removed. Matching records are skipped.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const result = (await callApi(() => window.bizora.restoreBackup(needsPassword ? password : undefined))) as {
        added?: number
        skipped?: number
      } | null
      if (!result) return
      const added = result.added || 0
      const skipped = result.skipped || 0
      showToast(
        added ? `Added ${added} records. Skipped ${skipped} duplicates.` : `Nothing new to add. Skipped ${skipped} duplicates.`,
        'success',
      )
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : ''
      if (code === 'INVALID_PASSWORD') setNeedsPassword(true)
      showToast(err instanceof Error ? err.message : 'Import failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">Import a backup</h3>
      <p className="text-sm text-ink-muted">
        If Bizora was deleted and installed again, the backup files are still in Documents\Bizora\Backups. Choose a
        BusinessBackup file to add those customers, invoices, and products. Records that are already in Bizora are skipped.
      </p>
      {needsPassword ? (
        <Field label="Backup password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      ) : null}
      <Button variant="outline" disabled={busy} onClick={() => void importBackup()}>
        {busy ? 'Importing…' : 'Import backup file'}
      </Button>
    </div>
  )
}

function LocalBackupCard() {
  const { showToast } = useAppStore()
  const [status, setStatus] = useState<{
    location: string
    lastBackup: { name: string; mtime: string } | null
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void callApi(() => window.bizora.backupStatus()).then((data) => {
      setStatus(data as { location: string; lastBackup: { name: string; mtime: string } | null })
    })
  }, [])

  async function backupNow() {
    setBusy(true)
    try {
      const result = await callApi(() => window.bizora.createBackup())
      if (result.drive === 'uploaded') showToast(`Saved ${result.name} and uploaded it to Google Drive`, 'success')
      else if (result.drive === 'failed') showToast(`Saved ${result.name} on this computer. ${result.driveError}`, 'error')
      else showToast(`Backup saved on this computer: ${result.name}`, 'success')
      const data = await callApi(() => window.bizora.backupStatus())
      setStatus(data as { location: string; lastBackup: { name: string; mtime: string } | null })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-ink-muted">
        {status?.lastBackup ? `Last file: ${status.lastBackup.name} · ${formatDateTime(status.lastBackup.mtime)}` : 'No backup file yet'}
      </div>
      {status?.location ? (
        <div className="space-y-2">
          <div className="break-all text-xs text-ink-muted">{status.location}</div>
          <Button variant="outline" onClick={() => void callApi(() => window.bizora.openBackupFolder())}>
            Open backup folder
          </Button>
        </div>
      ) : null}
      <Button disabled={busy} onClick={() => void backupNow()}>
        {busy ? 'Saving…' : 'Backup Now'}
      </Button>
    </div>
  )
}

function GoogleDrivePanel() {
  const { showToast } = useAppStore()
  const [status, setStatus] = useState<{
    configured: boolean
    connected: boolean
    email: string | null
    backups: { id: string; name: string; createdAt: string; size: number }[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function refresh() {
    const data = await callApi(() => window.bizora.googleDriveStatus())
    setStatus(data)
    setLoadError('')
  }

  useEffect(() => {
    void refresh().catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Google Drive is unavailable')
    })
  }, [])

  async function connect() {
    setBusy(true)
    try {
      const result = await callApi(() => window.bizora.connectGoogleDrive())
      showToast(result.email ? `Connected as ${result.email}` : 'Google Drive connected', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Drive sign-in failed', 'error')
    } finally {
      try {
        await refresh()
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Google Drive is unavailable')
      }
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await callApi(() => window.bizora.disconnectGoogleDrive())
      showToast('Google Drive disconnected', 'success')
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not disconnect Google Drive', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function uploadLatest() {
    setBusy(true)
    try {
      const result = await callApi(() => window.bizora.uploadLatestToGoogleDrive())
      showToast(
        result.result === 'skipped' ? `${result.name} is already in Google Drive` : `Uploaded ${result.name}`,
        'success',
      )
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Google Drive backup failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function restore(fileId: string, name: string) {
    if (!confirm(`Add ${name} to the data already in Bizora?\n\nNothing already here is removed. Matching records are skipped.`)) return
    setBusy(true)
    try {
      const result = (await callApi(() => window.bizora.restoreFromGoogleDrive(fileId))) as { added?: number; skipped?: number }
      const added = result.added || 0
      const skipped = result.skipped || 0
      showToast(
        added ? `Added ${added} records. Skipped ${skipped} duplicates.` : `Nothing new to add. Skipped ${skipped} duplicates.`,
        'success',
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      {!status && !loadError ? <p className="text-sm text-ink-muted">Checking Google Drive…</p> : null}
      {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
      {status && !status.configured ? (
        <p className="text-sm text-ink-muted">Google Drive is not configured on this computer.</p>
      ) : null}
      {status?.configured && !status.connected ? (
        <Button disabled={busy} onClick={() => void connect()}>
          {busy ? 'Waiting for Google…' : 'Connect Google Drive'}
        </Button>
      ) : null}
      {status?.connected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <img
                src={`${import.meta.env.BASE_URL}google-drive.svg`}
                alt=""
                width={22}
                height={22}
                className="h-[22px] w-[22px] shrink-0"
              />
              <div>
                <div className="text-sm font-semibold text-emerald-950">Google Drive connected</div>
                <div className="text-[13px] text-emerald-900">{status.email || 'Signed in'}</div>
              </div>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
          <p className="text-sm text-ink-muted">New backups on this computer are uploaded to this Google account.</p>
          <Button disabled={busy} onClick={() => void uploadLatest()}>
            {busy ? 'Working…' : 'Upload the latest file now'}
          </Button>
          {status.backups.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border px-3 py-2 text-xs font-medium text-ink-muted">Backups in Google Drive</div>
              {status.backups.map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{file.name}</div>
                    <div className="text-xs text-ink-muted">{formatDateTime(file.createdAt)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void restore(file.id, file.name)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No Google Drive backups yet.</p>
          )}
        </>
      ) : null}
    </div>
  )
}

function UpdatesPanel() {
  const appUpdate = useAppStore((s) => s.appUpdate)
  const setAppUpdate = useAppStore((s) => s.setAppUpdate)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!busy || !window.bizora?.onUpdateProgress) return
    return window.bizora.onUpdateProgress(setPercent)
  }, [busy])

  async function checkNow() {
    if (!window.bizora?.checkForUpdate) return
    setChecking(true)
    setError('')
    try {
      const update = await callApi(() => window.bizora.checkForUpdate())
      if (update) setAppUpdate(update)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check for updates.')
    } finally {
      setChecking(false)
    }
  }

  async function install() {
    setBusy(true)
    setError('')
    try {
      await callApi(() => window.bizora.installUpdate())
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'The update could not be downloaded.')
    }
  }

  const available = Boolean(appUpdate?.available)

  return (
    <Card className="max-w-xl space-y-3 p-5">
      <div className="text-sm font-semibold">Updates</div>
      {appUpdate ? (
        <p className="text-sm text-ink">
          This computer is running Bizora {appUpdate.current}.
          {available ? ` Version ${appUpdate.latest} is ready to install.` : null}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">Checking for a newer version…</p>
      )}
      {available ? (
        <p className="text-sm text-ink-muted">
          The update installs from this app and then Bizora restarts. Your bills and records stay on this PC.
        </p>
      ) : appUpdate?.reachable ? (
        <p className="text-sm text-ink-muted">Bizora is up to date.</p>
      ) : appUpdate ? (
        <p className="text-sm text-ink-muted">Connect to the internet to check for a newer version.</p>
      ) : null}
      {busy ? (
        <p className="text-sm font-medium">
          Downloading the latest version{percent > 0 ? `… ${percent}%` : '…'}
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        {available ? (
          <Button disabled={busy} onClick={() => void install()}>
            Update to latest
          </Button>
        ) : null}
        <Button variant="outline" disabled={busy || checking} onClick={() => void checkNow()}>
          {checking ? 'Checking…' : 'Check now'}
        </Button>
      </div>
    </Card>
  )
}

function AuditPanel() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    void callApi(() => window.bizora.listAudit({ pageSize: 100 })).then((d) =>
      setRows((d as { rows: Record<string, unknown>[] }).rows),
    )
  }, [])
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-ink-muted">
          <tr>
            <th className="px-4 py-2 text-left">Date & Time</th>
            <th className="px-4 py-2 text-left">User</th>
            <th className="px-4 py-2 text-left">Action</th>
            <th className="px-4 py-2 text-left">Module</th>
            <th className="px-4 py-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)} className="border-t border-border">
              <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(String(r.created_at))}</td>
              <td className="px-4 py-2">{String(r.user_name || '—')}</td>
              <td className="px-4 py-2">{String(r.action)}</td>
              <td className="px-4 py-2">{String(r.module)}</td>
              <td className="px-4 py-2">{String(r.description || '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function StaffPage() {
  const { showToast } = useAppStore()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', mobile: '' })

  async function load() {
    const data = await callApi(() => window.bizora.listStaff())
    setRows(data as Record<string, unknown>[])
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    try {
      await callApi(() => window.bizora.createStaff(form))
      showToast('Staff account created', 'success')
      setOpen(false)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to create staff', 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Staff" subtitle="Users and roles" actions={<Button onClick={() => setOpen(true)}>Add Staff</Button>} />
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Mobile</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{String(r.name)}</td>
                <td className="px-4 py-2.5">{String(r.email)}</td>
                <td className="px-4 py-2.5 capitalize">{String(r.role)}</td>
                <td className="px-4 py-2.5">{String(r.mobile || '—')}</td>
                <td className="px-4 py-2.5">{Number(r.is_active) ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-white p-5">
            <h2 className="text-sm font-semibold">Add Staff</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Password">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
              <Field label="Role">
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                  <option value="staff">Staff</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void save()}>Create Account</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function RestorePage() {
  const navigate = useNavigate()
  const { showToast, bootstrap } = useAppStore()

  async function restore() {
    try {
      const result = (await callApi(() => window.bizora.restoreBackup())) as { added?: number; skipped?: number } | null
      if (!result) return
      const added = result.added || 0
      const skipped = result.skipped || 0
      showToast(
        added ? `Added ${added} records. Skipped ${skipped} duplicates.` : `Nothing new to add. Skipped ${skipped} duplicates.`,
        'success',
      )
      await bootstrap()
      navigate('/sales/new')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed', 'error')
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-md p-8">
        <BrandLogo size="lg" className="mb-4" />
        <h1 className="text-xl font-semibold">Open Existing Backup</h1>
        <p className="mt-2 text-sm text-ink-muted">Choose a Bizora backup file.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => navigate('/sales/new')}>
            Cancel
          </Button>
          <Button onClick={() => void restore()}>Restore</Button>
        </div>
      </Card>
    </div>
  )
}
