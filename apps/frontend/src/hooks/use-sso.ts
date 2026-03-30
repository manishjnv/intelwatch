/**
 * @module hooks/use-sso
 * @description React Query hooks for SSO configuration management.
 * Tenant admin: GET/PUT/DELETE /settings/sso, POST /settings/sso/test
 * Super admin: GET /admin/tenants/:tenantId/sso (read-only view)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/Toast'
import { notifyApiError } from './useApiError'

// ─── Types ──────────────────────────────────────────────────

export type SsoProvider = 'saml' | 'oidc'

export interface GroupRoleMapping {
  groupName: string
  role: 'tenant_admin' | 'analyst'
  designation?: string
}

export interface SsoConfig {
  provider: SsoProvider
  enabled: boolean
  // SAML fields
  entityId?: string
  metadataUrl?: string
  certificate?: string
  // OIDC fields
  clientId?: string
  clientSecret?: string // backend returns "•••" for existing secrets
  issuerUrl?: string
  // Common fields
  approvedDomains: string[]
  groupMappings: GroupRoleMapping[]
}

export interface SsoTestResult {
  success: boolean
  error?: string
  provider?: string
  entityId?: string
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_SSO_CONFIG: SsoConfig = {
  provider: 'saml',
  enabled: true,
  entityId: 'https://idp.acme.com/metadata',
  metadataUrl: 'https://idp.acme.com/saml2/metadata',
  certificate: '',
  approvedDomains: ['acme.com', 'acme.io'],
  groupMappings: [
    { groupName: 'IT-Admins', role: 'tenant_admin' },
    { groupName: 'SOC-Analysts', role: 'analyst', designation: 'Senior Analyst' },
  ],
}

// ─── Hooks ──────────────────────────────────────────────────

/** Fetch current tenant's SSO config. */
export function useSsoConfig() {
  const result = useQuery({
    queryKey: ['sso-config'],
    queryFn: () =>
      api<SsoConfig>('/settings/sso')
        .catch(err => notifyApiError(err, 'SSO config', null)),
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && !result.data
  return { ...result, data: result.data ?? null, isDemo }
}

/** Save (create or update) SSO config. */
export function useSaveSsoConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (config: Partial<SsoConfig>) =>
      api<SsoConfig>('/settings/sso', { method: 'PUT', body: config }),
    onSuccess: () => {
      toast('SSO configuration saved.', 'success')
      void qc.invalidateQueries({ queryKey: ['sso-config'] })
    },
    onError: (err: Error) => {
      toast(`SSO save failed: ${err.message}`, 'error')
    },
  })
}

/** Delete SSO config entirely. */
export function useDeleteSsoConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api('/settings/sso', { method: 'DELETE' }),
    onSuccess: () => {
      toast('SSO configuration removed.', 'success')
      void qc.invalidateQueries({ queryKey: ['sso-config'] })
    },
    onError: (err: Error) => {
      toast(`SSO removal failed: ${err.message}`, 'error')
    },
  })
}

/** Test SSO connection. */
export function useTestSsoConnection() {
  return useMutation({
    mutationFn: () =>
      api<SsoTestResult>('/settings/sso/test', { method: 'POST' }),
    onSuccess: (data) => {
      if (data?.success) {
        toast('Connection successful.', 'success')
      } else {
        toast(`Connection failed: ${data?.error ?? 'Unknown error'}`, 'error')
      }
    },
    onError: (err: Error) => {
      toast(`Connection test failed: ${err.message}`, 'error')
    },
  })
}

/** Super admin: fetch a specific tenant's SSO config (read-only). */
export function useAdminSsoConfig(tenantId: string | null) {
  const result = useQuery({
    queryKey: ['admin-sso-config', tenantId],
    queryFn: () =>
      api<SsoConfig>(`/admin/tenants/${tenantId}/sso`)
        .catch(err => notifyApiError(err, 'tenant SSO config', null)),
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const isDemo = !result.isLoading && !result.data && !!tenantId
  return { ...result, data: isDemo ? DEMO_SSO_CONFIG : result.data ?? null, isDemo }
}
