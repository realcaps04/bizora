import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { useAppStore } from '@/stores/app'
import { Spinner } from '@/components/ui'
import { BrandLogo } from '@/components/BrandLogo'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { LockScreen, OnboardingPage } from '@/pages/WelcomePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { NewSalePage } from '@/pages/NewSalePage'
import { CustomersPage, CustomerDetailPage } from '@/pages/CustomersPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { AddProductPage } from '@/pages/AddProductPage'
import { SalesPage, InvoicesPage, InvoiceDetailPage } from '@/pages/InvoicesPage'
import { NewPurchasePage } from '@/pages/NewPurchasePage'
import { NewQuotationPage } from '@/pages/NewQuotationPage'
import { QuotationDetailPage } from '@/pages/QuotationDetailPage'
import { QuotationsPage, PurchasesPage, ExpensesPage, PaymentsPage } from '@/pages/OperationsPages'
import {
  ReportsPage,
  BackupPage,
  SettingsPage,
  StaffPage,
  RestorePage,
} from '@/pages/ReportsBackupSettings'

const Router = window.bizora ? HashRouter : BrowserRouter

function CustomerDetailRoute() {
  const { id = '' } = useParams()
  return <CustomerDetailPage id={id} />
}

function Protected({ children }: { children: React.ReactNode }) {
  const { authenticated, locked } = useAppStore()
  if (!authenticated) return <Navigate to="/login" replace />
  if (locked) return <LockScreen />
  return children
}

export default function App() {
  const { ready, bootstrap, authenticated, locked } = useAppStore()

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (!ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-canvas">
        <BrandLogo size="xl" />
        <Spinner label="Starting Bizora…" />
      </div>
    )
  }

  const home = authenticated && !locked ? '/sales/new' : '/login'

  return (
    <Router>
      <Routes>
        <Route path="/welcome" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={authenticated && !locked ? <Navigate to="/sales/new" replace /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/restore" element={<RestorePage />} />

        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route path="/" element={<Navigate to="/sales/new" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/sales/new" element={<NewSalePage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/quotations/new" element={<NewQuotationPage />} />
          <Route path="/quotations/:id" element={<QuotationDetailPage />} />
          <Route path="/quotations" element={<QuotationsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailRoute />} />
          <Route path="/products/new" element={<AddProductPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/purchases/new" element={<NewPurchasePage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Router>
  )
}
