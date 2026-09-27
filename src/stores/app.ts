import { create } from 'zustand'
import type { SessionUser } from '@/types'
import { callApi } from '@/utils'

interface AppState {
  ready: boolean
  hasCompany: boolean
  authenticated: boolean
  locked: boolean
  hasPin: boolean
  user: SessionUser | null
  companyName: string | null
  toast: { id: number; message: string; tone: 'success' | 'error' | 'info' } | null
  bootstrap: () => Promise<void>
  setSession: (data: {
    authenticated: boolean
    locked: boolean
    hasPin: boolean
    user: SessionUser | null
  }) => void
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void
  clearToast: () => void
  refreshCompany: () => Promise<void>
}

let toastId = 0

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  hasCompany: false,
  authenticated: false,
  locked: false,
  hasPin: false,
  user: null,
  companyName: null,
  toast: null,

  bootstrap: async () => {
    if (!window.bizora) {
      set({
        ready: true,
        hasCompany: false,
        authenticated: false,
        locked: false,
        hasPin: false,
        user: null,
      })
      console.error('[Bizora] Preload API unavailable. Run inside the Electron app window.')
      return
    }
    const state = await callApi(() => window.bizora.getState()) as {
      hasCompany: boolean
      session: {
        authenticated: boolean
        locked: boolean
        hasPin: boolean
        user: SessionUser | null
      }
    }
    set({
      ready: true,
      hasCompany: state.hasCompany,
      authenticated: state.session.authenticated,
      locked: state.session.locked,
      hasPin: state.session.hasPin,
      user: state.session.user,
    })
    if (state.session.authenticated && !state.session.locked) {
      await get().refreshCompany()
    }
  },

  setSession: (data) => set({ ...data }),

  showToast: (message, tone = 'info') => {
    const id = ++toastId
    set({ toast: { id, message, tone } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 3200)
  },

  clearToast: () => set({ toast: null }),

  refreshCompany: async () => {
    try {
      const company = await callApi(() => window.bizora.getCompany()) as { name?: string } | null
      set({ companyName: company?.name ?? null })
    } catch {
      set({ companyName: null })
    }
  },
}))
