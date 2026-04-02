import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OrgProfile } from '@/types/org-profile'

interface OrgProfileState {
  profile: OrgProfile | null
  setProfile: (p: OrgProfile) => void
  clearProfile: () => void
}

export const useOrgProfileStore = create<OrgProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      clearProfile: () => set({ profile: null }),
    }),
    { name: 'etip_org_profile' },
  ),
)
