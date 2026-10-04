import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/layouts/AppShell'
import { useAppStore } from '@/stores/app'
import { Spinner } from '@/components/ui'
import { BrandLogo } from '@/components/BrandLogo'
import { UpdatePrompt } from '@/components/UpdatePrompt'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { LockScreen, OnboardingPage } from '@/pages/WelcomePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { NewSalePage } from '@/pages/NewSalePage'
import { CustomersPage, CustomerDetailPage } from '@/pages/CustomersPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { AddProductPage } from '@/pages/AddProductPage'
import { BulkProductsPage } from '@/pages/BulkProductsPage'
import { SalesPage, InvoicesPage, InvoiceDetailPage } from '@/pages/InvoicesPage'
import { NewPurchasePage } from '@/pages/NewPurchasePage'
import { NewQuotationPage } from '@/pages/NewQuotationPage'
import { QuotationDetailPage } from '@/pages/QuotationDetailPage'
import { QuotationsPage, PurchasesPage, ExpensesPage, PaymentsPage } from '@/pages/OperationsPages'
import { ReturnsPage } from '@/pages/ReturnsPage'
import {
  ReportsPage,
  SettingsPage,
  StaffPage,
  RestorePage,
} from '@/pages/ReportsBackupSettings'

const Router = window.bizora ? HashRouter : BrowserRouter

function EditProductRoute() {
  const { id = '' } = useParams()
  return <AddProductPage productId={id} />
}

function EditInvoiceRoute() {
  const { id = '' } = useParams()
  return <NewSalePage invoiceId={id} />
}

function EditQuotationRoute() {
  const { id = '' } = useParams()
  return <NewQuotationPage quotationId={id} />
}

function CustomerDetailRoute() {
  const { id = '' } = useParams()
  return <CustomerDetailPage id={id} />
}

function savedPage(): string {
  const saved = localStorage.getItem('bizora.lastPath') || ''
  if (!saved.startsWith('/') || saved === '/' || saved.startsWith('/login') || saved.startsWith('/register')) {
    return '/sales/new'
  }
  return saved
}

function ResumePage() {
  return <Navigate to={savedPage()} replace />
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
    <>
      <UpdatePrompt />
      <Router>
      <Routes>
        <Route path="/welcome" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={authenticated && !locked ? <ResumePage /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/restore" element={<RestorePage />} />

        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route path="/" element={<ResumePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/sales/new" element={<NewSalePage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/:id/edit" element={<EditInvoiceRoute />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
          <Route path="/quotations/new" element={<NewQuotationPage />} />
          <Route path="/quotations/:id/edit" element={<EditQuotationRoute />} />
          <Route path="/quotations/:id" element={<QuotationDetailPage />} />
          <Route path="/quotations" element={<QuotationsPage />} />
          <Route path="/returns" element={<ReturnsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailRoute />} />
          <Route path="/products/new" element={<AddProductPage />} />
          <Route path="/products/:id/edit" element={<EditProductRoute />} />
          <Route path="/products/bulk" element={<BulkProductsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/purchases/new" element={<NewPurchasePage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Router>
    </>
  )
}
