// =============================================================================
// GESTIO 229 SaaS - Core Types
// Types centraux du système multi-tenant
// =============================================================================

// ─── Secteurs ─────────────────────────────────────────────────────────────────

export interface Sector {
  id: string
  slug: string
  name: string
  description?: string
  icon: string
  color: string
  modules: string[]           // IDs des modules communs activés
  specific_modules: string[]  // IDs des modules métier spécifiques
  is_active: boolean
  sort_order: number
  // Enrichi lors du chargement du tenant
  is_configured?: boolean
  configuration?: SectorConfiguration
}

export interface SectorConfiguration {
  point_of_sale_name?: string
  address?: string
  phone?: string
  manager?: string
  currency?: string
  billing_mode?: 'direct' | 'invoice' | 'both'
  warehouses?: string[]
  cash_registers?: string[]
}

// ─── Plans & Abonnements ──────────────────────────────────────────────────────

export interface SubscriptionPlan {
  id: string
  name: string
  slug: 'trial' | 'solo' | 'duo' | 'multiservices' | 'enterprise'
  max_sectors: number
  max_users: number
  max_products: number
  price_monthly: number
  price_yearly: number
  features: string[]
  is_active: boolean
}

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'grace_period'
  | 'readonly'
  | 'expired'
  | 'suspended'
  | 'cancelled'

export interface Subscription {
  id: string
  company_id: string
  plan_id: string
  status: SubscriptionStatus
  started_at: string
  expires_at?: string
  grace_ends_at?: string
  auto_renew: boolean
  plan?: SubscriptionPlan
}

export interface SubscriptionPayment {
  id: string
  company_id: string
  subscription_id?: string
  reference: string
  amount: number
  currency: string
  payment_method: 'mtn_momo' | 'moov_money' | 'wave' | 'card' | 'cash' | 'manual'
  gateway_reference?: string
  status: 'pending' | 'success' | 'failed' | 'refunded'
  period_start?: string
  period_end?: string
  paid_at?: string
  created_at: string
}

// ─── Entreprise (Tenant) ──────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  slug?: string
  responsible_name?: string
  legal_form?: string
  ifu_number?: string
  rccm_number?: string
  regime_fiscal?: string
  address?: string
  city?: string
  country?: string
  phone?: string
  email?: string
  currency: string
  tva_default_rate?: number
  aib_default_rate?: number
  logo_url?: string
  subscription_status: SubscriptionStatus
  trial_ends_at?: string
  onboarding_completed: boolean
  e_mecef_active?: boolean
  e_mecef_nim?: string
  timezone: string
  language: string
  plan_id?: string
  created_at: string
  // Relations
  plan?: SubscriptionPlan
  subscription?: Subscription[]
  sectors?: CompanySectorLink[]
}

export interface CompanySectorLink {
  id: string
  company_id: string
  sector_id: string
  is_configured: boolean
  configuration: SectorConfiguration
  activated_at: string
  sector?: Sector
}

// ─── Utilisateurs & RBAC ─────────────────────────────────────────────────────

export type UserRole =
  | 'administrateur'
  | 'gerant'
  | 'caissier'
  | 'magasinier'
  | 'comptable'
  | string // rôles personnalisés

export interface UserPermissions {
  ventes?: { view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }
  stock?: { view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }
  finances?: { view?: boolean; caisse?: boolean; tresorerie?: boolean; banque?: boolean }
  clients?: { view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }
  fournisseurs?: { view?: boolean; create?: boolean; edit?: boolean }
  rh?: { view?: boolean; create?: boolean; edit?: boolean }
  depenses?: { view?: boolean; create?: boolean; edit?: boolean }
  rapports?: { view?: boolean }
  audit?: { view?: boolean }
  admin?: { view?: boolean }
  [key: string]: Record<string, boolean> | undefined
}

export interface UserProfile {
  id: string
  company_id: string
  auth_user_id?: string
  full_name: string
  username: string
  email: string
  phone?: string
  role: UserRole
  is_super_admin: boolean
  allowed_sectors: string[]  // UUIDs des secteurs autorisés
  allowed_sites: string[]    // UUIDs des emplacements autorisés
  permissions: UserPermissions
  pos_pin_code?: string
  avatar_url?: string
  is_active: boolean
  locale: string
  last_login?: string
  created_at: string
}

export interface RolePermission {
  id: string
  company_id: string
  role_name: string
  permissions: UserPermissions
  is_system_role: boolean
}

// ─── Routage Post-Connexion ───────────────────────────────────────────────────

export type RoutingType = 'SOLO' | 'MULTISERVICES' | 'ONBOARDING' | 'SUSPENDED'

export interface RoutingDecision {
  type: RoutingType
  redirectTo: string
  activeSectors: Sector[]
  requiresOnboarding?: string  // slug du secteur non configuré
}

// ─── Inscription ─────────────────────────────────────────────────────────────

export interface RegistrationData {
  company_name: string
  responsible_name: string
  phone: string
  email: string
  country: string
  city: string
  ifu_number?: string
  selected_sector_slugs: string[]  // slugs des secteurs sélectionnés
}

export interface RegistrationResult {
  success: boolean
  company_id?: string
  email?: string
  error?: string
}
