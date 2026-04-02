import { useAuthStore } from '@/stores/auth-store'
import { useOrgProfileStore } from '@/stores/org-profile-store'
import type { OrgProfile } from '@/types/org-profile'

export type DashboardMode = 'org-aware' | 'global' | 'super-admin'

export function useDashboardMode(): { mode: DashboardMode; profile: OrgProfile | null } {
  const role = useAuthStore(s => s.user?.role)
  const profile = useOrgProfileStore(s => s.profile)

  if (role === 'super_admin') return { mode: 'super-admin', profile: null }
  if (profile) return { mode: 'org-aware', profile }
  return { mode: 'global', profile: null }
}
