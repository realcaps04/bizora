import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  FileText,
  Users,
  Package,
  Truck,
  Wallet,
  CreditCard,
  BarChart3,
  UserCog,
  HardDrive,
  Settings,
  Lock,
  LogOut,
  Quote,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardList,
  X,
} from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { callApi, cn } from '@/utils'
import { useEffect, useRef, useState } from 'react'
import { Button, Toast } from '@/components/ui'
import { BrandLogo } from '@/components/BrandLogo'
import { WindowControls } from '@/components/login/WindowControls'

type NavChild = {
  to: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  end?: boolean
}

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ size?: number }>
  end?: boolean
  children?: NavChild[]
}

const primaryNav: NavItem[] = [
  {
    to: '/sales/new',
    label: 'New Sales',
    icon: ShoppingCart,
    end: true,
    children: [{ to: '/sales', label: 'Sales List', icon: Receipt, end: true }],
  },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/quotations/new', label: 'Quotations', icon: Quote, end: true },
  { to: '/quotations', label: 'Quotation List', icon: ClipboardList, end: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/purchases/new', label: 'Purchases', icon: Truck, end: true },
  { to: '/purchases', label: 'Purchase List', icon: ClipboardList, end: true },
  { to: '/expenses', label: 'Expenses', icon: Wallet },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

const secondaryNav: NavItem[] = [
  { to: '/staff', label: 'Staff', icon: UserCog },
  { to: '/backup', label: 'Backup', icon: HardDrive },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SIDEBAR_KEY = 'bizora.sidebarOpen'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, companyName, toast, clearToast, showToast, setSession, bootstrap } = useAppStore()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // New Sales always starts with the sidebar collapsed
    const path = window.location.hash.replace(/^#/, '') || window.location.pathname
    if (
      path.startsWith('/sales/new') ||
      path.startsWith('/purchases/new') ||
      path.startsWith('/quotations/new') ||
      path.startsWith('/products/new') ||
      path.startsWith('/products/bulk') ||
      /\/products\/[^/]+\/edit$/.test(path)
    ) {
      return false
    }
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (saved === null) return false
    return saved === 'true'
  })
  const composeRouteKeyRef = useRef<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)

  const composeRouteKey =
    location.pathname === '/sales/new'
      ? '/sales/new'
      : location.pathname === '/purchases/new'
        ? '/purchases/new'
        : location.pathname === '/quotations/new'
          ? '/quotations/new'
          : location.pathname === '/products/new'
            ? '/products/new'
            : location.pathname === '/products/bulk'
              ? '/products/bulk'
              : /\/products\/[^/]+\/edit$/.test(location.pathname)
                ? location.pathname
                : null

  useEffect(() => {
    if (!composeRouteKey) {
      composeRouteKeyRef.current = null
      return
    }
    // Collapse only when first entering this compose screen — never block manual expand
    if (composeRouteKeyRef.current !== composeRouteKey) {
      composeRouteKeyRef.current = composeRouteKey
      setSidebarOpen(false)
    }
  }, [composeRouteKey])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    const path = `${location.pathname}${location.search}`
    if (path === '/' || path.startsWith('/login') || path.startsWith('/register')) return
    localStorage.setItem('bizora.lastPath', path)
  }, [location.pathname, location.search])

  function toggleSidebar() {
    setSidebarOpen((open) => !open)
  }

  useEffect(() => {
    if (!logoutOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLogoutOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [logoutOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        navigate('/sales/new')
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        void lockApp()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        if (e.shiftKey) {
          toggleSidebar()
        } else {
          navigate('/backup')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    const unsub = window.bizora.onSessionLocked?.(() => {
      setSession({ authenticated: true, locked: true, hasPin: true, user })
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      unsub?.()
    }
  }, [navigate, user, setSession])

  async function lockApp() {
    await callApi(() => window.bizora.lock())
    setSession({ authenticated: true, locked: true, hasPin: useAppStore.getState().hasPin, user })
    showToast('Application locked', 'info')
  }

  async function logout() {
    setLogoutOpen(false)
    await callApi(() => window.bizora.logout())
    await bootstrap()
    navigate('/login')
  }

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          'no-print flex h-full shrink-0 flex-col bg-sidebar text-white transition-[width] duration-200',
          sidebarOpen ? 'w-[240px]' : 'w-[64px]',
        )}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className={cn(
            'relative border-b border-white/10',
            sidebarOpen ? 'px-3 py-3 pr-10' : 'flex flex-col items-center gap-2 px-2 py-3',
          )}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {sidebarOpen ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandLogo size="sm" className="shrink-0" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate whitespace-nowrap text-[13px] font-semibold leading-tight">Bizora</div>
                <div className="truncate whitespace-nowrap text-[11px] leading-tight text-sidebar-muted">
                  Business Management
                </div>
              </div>
            </div>
          ) : (
            <BrandLogo size="sm" className="shrink-0" />
          )}
          <button
            type="button"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            onClick={toggleSidebar}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-white',
              sidebarOpen ? 'absolute right-2 top-1/2 -translate-y-1/2' : '',
            )}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>

        <nav
          className={cn('min-h-0 flex-1 overflow-y-auto py-3', sidebarOpen ? 'px-2' : 'px-1.5')}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <NavGroup items={primaryNav} collapsed={!sidebarOpen} />
          <div className={cn('my-3 border-t border-white/10', sidebarOpen ? 'mx-0' : 'mx-1')} />
          <NavGroup items={secondaryNav} collapsed={!sidebarOpen} />
        </nav>

        <div
          className={cn('border-t border-white/10', sidebarOpen ? 'p-3' : 'p-1.5')}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {sidebarOpen ? (
            <>
              <div className="mb-2 rounded-md bg-white/5 px-2.5 py-2">
                <div className="truncate text-[13.5px] font-medium">{user?.name}</div>
                <div className="text-[11.5px] capitalize text-sidebar-muted">{user?.role}</div>
              </div>
              <div className="mb-2 flex items-center gap-1.5 px-1 text-[11.5px] text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Local Mode
              </div>
              <button
                type="button"
                onClick={() => void lockApp()}
                className="mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
              >
                <Lock size={14} /> Lock Application
              </button>
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
              >
                <LogOut size={14} /> Logout
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                title="Lock Application"
                aria-label="Lock Application"
                onClick={() => void lockApp()}
                className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
              >
                <Lock size={15} />
              </button>
              <button
                type="button"
                title="Logout"
                aria-label="Logout"
                onClick={() => setLogoutOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas print:overflow-visible print:bg-white">
        <div
          className="no-print relative flex h-10 shrink-0 items-center border-b border-border bg-white px-3"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28">
            <div
              className="max-w-full truncate text-center text-[13px] font-semibold tracking-tight text-[#031C45]"
              title={companyName || 'Workspace'}
            >
              {companyName || 'Workspace'}
            </div>
          </div>
          <div className="relative z-10 ml-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <WindowControls />
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto p-5 print:overflow-visible print:p-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Outlet />
        </div>
      </main>

      {logoutOpen ? (
        <div
          className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-[#031C45]/35 p-4"
          onMouseDown={() => setLogoutOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="logout-title"
            className="w-full max-w-[380px] overflow-hidden rounded-[14px] border border-[#D8E4F2] bg-white shadow-[0_18px_50px_rgba(3,28,69,0.18)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 px-5 pb-1 pt-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EAF4FF] text-[#0878F9]">
                <LogOut size={18} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="logout-title" className="text-[15px] font-semibold tracking-tight text-[#031C45]">
                  Sign out of Bizora?
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#62789A]">
                  You will need your password to sign in again.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setLogoutOpen(false)}
                className="rounded-md p-1 text-[#94A3B8] hover:bg-[#F5F7FA] hover:text-[#031C45]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="outline" onClick={() => setLogoutOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void logout()}>Sign out</Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast.message} tone={toast.tone} onClose={clearToast} /> : null}
    </div>
  )
}

function NavGroup({
  items,
  collapsed,
}: {
  items: NavItem[]
  collapsed: boolean
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div key={item.to}>
          <NavLink
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-md text-[13px] font-medium transition-colors',
                collapsed ? 'h-9 w-full justify-center' : 'gap-2 px-2.5 py-[6px]',
                isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white',
              )
            }
          >
            <item.icon size={15} />
            {!collapsed ? item.label : null}
          </NavLink>

          {!collapsed && item.children?.length ? (
            <div className="mt-0.5 ml-3 space-y-0.5 border-l border-white/10 pl-2">
              {item.children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  end={child.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[12.5px] font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-active/80 text-white'
                        : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white',
                    )
                  }
                >
                  <child.icon size={14} />
                  {child.label}
                </NavLink>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
