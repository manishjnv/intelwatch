/**
 * @module __tests__/mfa-ui.test
 * @description Tests for MFA UI components: StatusCard, SetupWizard, DisableModal, BackupCodesModal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { MfaStatusCard } from '@/components/security/MfaStatusCard'
import { MfaSetupWizard } from '@/components/security/MfaSetupWizard'
import { DisableMfaModal } from '@/components/security/DisableMfaModal'
import { BackupCodesModal } from '@/components/security/BackupCodesModal'

// ─── Mock hooks ──────────────────────────────────────────────

const mockSetup = vi.fn()
const mockVerify = vi.fn()
const mockDisable = vi.fn()
const mockRegenerate = vi.fn()

vi.mock('@/hooks/use-mfa', () => ({
  useMfaSetup: () => ({
    mutate: mockSetup,
    isPending: false,
    error: null,
  }),
  useMfaVerifySetup: () => ({
    mutate: mockVerify,
    isPending: false,
    error: null,
  }),
  useMfaDisable: () => ({
    mutate: mockDisable,
    isPending: false,
    error: null,
  }),
  useRegenerateBackupCodes: () => ({
    mutate: mockRegenerate,
    isPending: false,
    error: null,
  }),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr-code" data-value={value}>QR</div>,
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

const mockUser = {
  id: 'u1', email: 'test@test.com', displayName: 'Test',
  role: 'analyst', tenantId: 't1', avatarUrl: null,
  mfaEnabled: false, emailVerified: true, mfaVerifiedAt: null,
}

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => {
    const state = {
      user: mockUser,
      setUser: vi.fn(),
    }
    return selector(state)
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── MfaStatusCard ──────────────────────────────────────────

describe('MfaStatusCard', () => {
  it('shows disabled state with Enable button when MFA is off', () => {
    mockUser.mfaEnabled = false
    render(<MfaStatusCard />)
    expect(screen.getByText('Two-Factor Authentication')).toBeTruthy()
    expect(screen.getByText('Two-factor authentication is not enabled')).toBeTruthy()
    expect(screen.getByTestId('enable-mfa-btn')).toBeTruthy()
  })

  it('shows enabled state with Disable/Regenerate buttons when MFA is on', () => {
    mockUser.mfaEnabled = true
    mockUser.mfaVerifiedAt = '2026-03-01T00:00:00Z'
    render(<MfaStatusCard />)
    expect(screen.getByTestId('disable-mfa-btn')).toBeTruthy()
    expect(screen.getByTestId('regenerate-codes-btn')).toBeTruthy()
  })

  it('shows enforcement warning when enforcementWarning is true and MFA is off', () => {
    mockUser.mfaEnabled = false
    render(<MfaStatusCard enforcementWarning />)
    expect(screen.getByText(/Your organization requires MFA/)).toBeTruthy()
  })

  it('opens setup wizard when Enable MFA is clicked', () => {
    mockUser.mfaEnabled = false
    render(<MfaStatusCard />)
    fireEvent.click(screen.getByTestId('enable-mfa-btn'))
    expect(screen.getByTestId('mfa-setup-modal')).toBeTruthy()
  })
})

// ─── MfaSetupWizard ─────────────────────────────────────────

describe('MfaSetupWizard', () => {
  it('renders step 1 (QR) and calls setup on mount', () => {
    render(<MfaSetupWizard onClose={vi.fn()} />)
    expect(mockSetup).toHaveBeenCalled()
    expect(screen.getByTestId('step-qr')).toBeTruthy()
    expect(screen.getByText('Scan QR Code')).toBeTruthy()
  })

  it('displays QR code after setup resolves', () => {
    mockSetup.mockImplementation((_: any, opts: any) => {
      opts.onSuccess({
        secret: 'TESTSECRET',
        qrCodeUri: 'otpauth://totp/test',
        backupCodes: ['a1b2-c3d4', 'e5f6-g7h8'],
      })
    })
    render(<MfaSetupWizard onClose={vi.fn()} />)
    expect(screen.getByTestId('qr-code')).toBeTruthy()
    expect(screen.getByTestId('manual-code')).toBeTruthy()
  })

  it('navigates to verify step on Next click', () => {
    mockSetup.mockImplementation((_: any, opts: any) => {
      opts.onSuccess({
        secret: 'TESTSECRET',
        qrCodeUri: 'otpauth://totp/test',
        backupCodes: ['a1b2-c3d4'],
      })
    })
    render(<MfaSetupWizard onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('next-to-verify'))
    expect(screen.getByTestId('step-verify')).toBeTruthy()
    expect(screen.getByTestId('totp-input')).toBeTruthy()
  })

  it('navigates to backup step after successful verify', () => {
    mockSetup.mockImplementation((_: any, opts: any) => {
      opts.onSuccess({
        secret: 'TESTSECRET',
        qrCodeUri: 'otpauth://totp/test',
        backupCodes: ['a1b2-c3d4', 'e5f6-g7h8'],
      })
    })
    mockVerify.mockImplementation((_: any, opts: any) => {
      opts.onSuccess()
    })

    render(<MfaSetupWizard onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('next-to-verify'))
    fireEvent.change(screen.getByTestId('totp-input'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('verify-btn'))
    expect(screen.getByTestId('step-backup')).toBeTruthy()
    expect(screen.getByTestId('backup-codes-grid')).toBeTruthy()
  })

  it('Done button is disabled until checkbox is checked', () => {
    mockSetup.mockImplementation((_: any, opts: any) => {
      opts.onSuccess({
        secret: 'TESTSECRET',
        qrCodeUri: 'otpauth://totp/test',
        backupCodes: ['a1b2-c3d4'],
      })
    })
    mockVerify.mockImplementation((_: any, opts: any) => { opts.onSuccess() })

    render(<MfaSetupWizard onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('next-to-verify'))
    fireEvent.change(screen.getByTestId('totp-input'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('verify-btn'))

    const doneBtn = screen.getByTestId('done-btn')
    expect(doneBtn).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByTestId('saved-checkbox'))
    expect(doneBtn).toHaveProperty('disabled', false)
  })
})

// ─── DisableMfaModal ────────────────────────────────────────

describe('DisableMfaModal', () => {
  it('renders warning and TOTP input', () => {
    render(<DisableMfaModal onClose={vi.fn()} />)
    expect(screen.getByText(/Are you sure you want to disable MFA/)).toBeTruthy()
    expect(screen.getByTestId('disable-totp-input')).toBeTruthy()
  })

  it('calls disable with TOTP code on confirm', () => {
    render(<DisableMfaModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('disable-totp-input'), { target: { value: '654321' } })
    fireEvent.click(screen.getByTestId('confirm-disable-btn'))
    expect(mockDisable).toHaveBeenCalledWith({ code: '654321' }, expect.any(Object))
  })

  it('disables confirm button when code is less than 6 digits', () => {
    render(<DisableMfaModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('disable-totp-input'), { target: { value: '123' } })
    expect(screen.getByTestId('confirm-disable-btn')).toHaveProperty('disabled', true)
  })
})

// ─── BackupCodesModal ───────────────────────────────────────

describe('BackupCodesModal', () => {
  it('renders TOTP input for regeneration', () => {
    render(<BackupCodesModal onClose={vi.fn()} />)
    expect(screen.getByText(/invalidate all existing backup codes/)).toBeTruthy()
    expect(screen.getByTestId('regen-totp-input')).toBeTruthy()
  })

  it('shows new codes after successful regeneration', () => {
    mockRegenerate.mockImplementation((_: any, opts: any) => {
      opts.onSuccess({ codes: ['new1-code', 'new2-code', 'new3-code'] })
    })
    render(<BackupCodesModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('regen-totp-input'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('confirm-regen-btn'))
    expect(screen.getByTestId('backup-codes-grid')).toBeTruthy()
    expect(screen.getByText('new1-code')).toBeTruthy()
  })
})
