// =============================================================================
// GESTIO 229 SaaS — UI Store (Zustand)
// Gère l'état de l'interface : sidebar, notifications, thème, module actif
// =============================================================================

import { create } from 'zustand'

interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean
  sidebarMobileOpen: boolean
  activeModuleId: string | null

  // Notifications toast
  notifications: Notification[]

  // Thème
  darkMode: boolean

  // Module actif (pour highlight sidebar)
  setActiveModule: (moduleId: string | null) => void
  toggleSidebar: () => void
  toggleMobileSidebar: () => void
  closeMobileSidebar: () => void

  // Notifications
  addNotification: (notif: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void

  // Toast helpers
  toast: {
    success: (title: string, message?: string) => void
    error: (title: string, message?: string) => void
    info: (title: string, message?: string) => void
    warning: (title: string, message?: string) => void
  }

  // Thème
  toggleDarkMode: () => void
}

let notifCounter = 0

export const useUIStore = create<UIState>()((set, get) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,
  activeModuleId: null,
  notifications: [],
  darkMode: false,

  setActiveModule: (moduleId) => set({ activeModuleId: moduleId }),

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  toggleMobileSidebar: () =>
    set((s) => ({ sidebarMobileOpen: !s.sidebarMobileOpen })),

  closeMobileSidebar: () => set({ sidebarMobileOpen: false }),

  addNotification: (notif) => {
    const id = `notif-${++notifCounter}`
    const full: Notification = { ...notif, id }
    set((s) => ({ notifications: [...s.notifications, full] }))
    // Auto-remove après durée
    const duration = notif.duration ?? 4000
    if (duration > 0) {
      setTimeout(() => {
        get().removeNotification(id)
      }, duration)
    }
  },

  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  clearNotifications: () => set({ notifications: [] }),

  toast: {
    success: (title, message) =>
      get().addNotification({ type: 'success', title, message }),
    error: (title, message) =>
      get().addNotification({ type: 'error', title, message, duration: 6000 }),
    info: (title, message) =>
      get().addNotification({ type: 'info', title, message }),
    warning: (title, message) =>
      get().addNotification({ type: 'warning', title, message }),
  },

  toggleDarkMode: () => {
    set((s) => {
      const next = !s.darkMode
      document.documentElement.classList.toggle('dark', next)
      return { darkMode: next }
    })
  },
}))
