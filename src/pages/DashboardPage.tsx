import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, PageHeader, Spinner } from '@/components/ui'
import { callApi, formatDate, formatMoney, greeting, statusTone } from '@/utils'
import type { Invoice } from '@/types'

interface DashboardData {
  todaySales: number
  monthSales: number
  outstanding: number
  customers: number
  recentInvoices: Invoice[]
  salesOverview: { day: string; total: number }[]
  greetingName: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const stats = await callApi(() => window.bizora.dashboardStats())
        setData(stats as DashboardData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load dashboard')
      }
    })()
  }, [])

  if (error) return <div className="text-sm text-danger">{error}</div>
  if (!data) return <Spinner />

  const kpis = [
    { label: "Today's Sales", value: formatMoney(data.todaySales) },
    { label: 'This Month', value: formatMoney(data.monthSales) },
    { label: 'Outstanding', value: formatMoney(data.outstanding) },
    { label: 'Total Customers', value: String(data.customers) },
  ]

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${data.greetingName.split(' ')[0]}`}
        subtitle="Business overview"
        actions={
          <Button onClick={() => navigate('/sales/new')}>New Sale</Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="px-4 py-3">
            <div className="text-xs font-medium text-ink-muted">{kpi.label}</div>
            <div className="mt-1.5 text-[15px] font-semibold tabular-nums text-ink">{kpi.value}</div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sales Overview</h2>
            <span className="text-xs text-ink-muted">Last 30 days</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesOverview}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
                <Area type="monotone" dataKey="total" stroke="#2563eb" fill="url(#salesFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
          <div className="grid gap-2">
            {[
              { label: 'New Sale', to: '/sales/new' },
              { label: 'New Customer', to: '/customers?new=1' },
              { label: 'Add Product', to: '/products?add=1' },
              { label: 'Create Quotation', to: '/quotations/new' },
              { label: 'View Reports', to: '/reports' },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="rounded-md border border-border px-3 py-2.5 text-sm font-medium text-ink hover:border-brand/40 hover:bg-brand-soft"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Invoices</h2>
          <Link to="/invoices" className="text-xs font-medium text-brand">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Invoice No.</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                    No invoices yet. Create your first sale to get started.
                  </td>
                </tr>
              ) : (
                data.recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 font-medium">
                      <Link to={`/invoices/${inv.id}`} className="text-brand hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{inv.customer_name}</td>
                    <td className="px-4 py-2.5">{formatDate(inv.invoice_date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(inv.grand_total)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(inv.payment_status) as never}>{inv.payment_status}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(inv.status) as never}>{inv.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
