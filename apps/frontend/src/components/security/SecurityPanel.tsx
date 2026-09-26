/**
 * @module components/security/SecurityPanel
 * @description Security sub-tab: MFA status, enforcement toggle (tenant_admin), active sessions.
 */
import { useState } from 'react'
import { Shield, Loader2 } from 'lucide-react'
import { MfaStatusCard } from './MfaStatusCard'
import { ActiveSessionsList } from './ActiveSessionsList'
import { useMfaEnforcement, useUpdateMfaEnforcement } from '@/hooks/use-mfa'
import { toast } from '@/components/ui/Toast'
import type { useCommandCenter } from '@/hooks/use-command-center'

interface SecurityPanelProps {
  data: ReturnType<typeof useCommandCenter>
}

export function SecurityPanel({ data }: SecurityPanelProps) {
  const { isSuperAdmin, userRole } = data
  const isTenantAdmin = userRole === 'tenant_admin' || isSuperAdmin

  return (
    <div className="space-y-6" data-testid="security-panel">
      <MfaStatusCard />

      {isTenantAdmin && !isSuperAdmin && <MfaEnforcementCard scope="tenant" />}

      <ActiveSessionsList />
    </div>
  )
}

// ─── MFA Enforcement Toggle Card ──────────────────────────────

export function MfaEnforcementCard({ scope }: { scope: 'tenant' | 'platform' }) {
  const enforcement = useMfaEnforcement(scope)
  const update = useUpdateMfaEnforcement(scope)
  const [pending, setPending] = useState(false)

  const data = enforcement.data
  const isEnforced = data?.enforced ?? false
  const label = scope === 'platform'
    ? 'Require MFA platform-wide for all users'
    : 'Require MFA for all users in this organization'

  const handleToggle = () => {
    const newValue = !isEnforced
    setPending(true)
    update.mutate({ enforced: newValue }, {
      onSuccess: () => {
        toast(newValue ? 'MFA enforcement enabled' : 'MFA enforcement disabled', 'success')
        setPending(false)
      },
      onError: () => setPending(false),
    })
  }

  if (enforcement.isLoading) {
    return <div className="h-16 bg-bg-elevated rounded-xl animate-pulse" />
  }

  return (
    <div className="border border-border rounded-xl p-5 bg-bg-primary" data-testid="mfa-enforcement-card">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Shield className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">MFA Enforcement</h3>
            <p className="text-xs text-text-muted mt-0.5">{label}</p>
            {scope === 'platform' && data?.usersWithMfa != null && data?.totalUsers != null && (
              <p className="text-[10px] text-text-muted mt-1">
                {data.usersWithMfa} of {data.totalUsers} users have MFA enabled
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={pending}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
            isEnforced ? 'bg-accent' : 'bg-bg-hover'
          }`}
          data-testid="enforcement-toggle"
          aria-label="Toggle MFA enforcement"
        >
          {pending ? (
            <Loader2 className="w-3 h-3 animate-spin absolute top-1 left-1/2 -translate-x-1/2 text-text-muted" />
          ) : (
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              isEnforced ? 'translate-x-5' : 'translate-x-0.5'
            }`} />
          )}
        </button>
      </div>

      {isEnforced && (
        <p className="text-[10px] text-amber-400 mt-2 ml-8">
          Users without MFA will be prompted to set it up on next login
        </p>
      )}
    </div>
  )
}
