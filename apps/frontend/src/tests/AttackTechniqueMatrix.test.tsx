import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { AttackTechniqueMatrix, type AttackTechnique } from '@/components/attack/AttackTechniqueMatrix'

const MOCK_TECHNIQUES: AttackTechnique[] = [
  { techniqueId: 'T1190', name: 'Exploit Public-Facing App', tactic: 'initial-access', severity: 'high' },
  { techniqueId: 'T1059', name: 'Command & Scripting', tactic: 'execution', severity: 'high' },
  { techniqueId: 'T1078', name: 'Valid Accounts', tactic: 'persistence', severity: 'medium' },
  { techniqueId: 'T1003', name: 'OS Credential Dumping', tactic: 'credential-access', severity: 'high' },
  { techniqueId: 'T1071', name: 'Application Layer Proto', tactic: 'command-and-control', severity: 'medium' },
  { techniqueId: 'T1105', name: 'Ingress Tool Transfer', tactic: 'command-and-control', severity: 'low' },
]

describe('AttackTechniqueMatrix', () => {
  it('renders technique table grouped by tactic', () => {
    render(<AttackTechniqueMatrix techniques={MOCK_TECHNIQUES} entityName="APT29" entityType="actor" />)
    expect(screen.getByTestId('tactic-initial-access')).toBeInTheDocument()
    expect(screen.getByTestId('tactic-execution')).toBeInTheDocument()
    expect(screen.getByTestId('tactic-persistence')).toBeInTheDocument()
    expect(screen.getByTestId('tactic-credential-access')).toBeInTheDocument()
    expect(screen.getByTestId('tactic-command-and-control')).toBeInTheDocument()
  })

  it('technique cells colored by severity — high=red', () => {
    render(<AttackTechniqueMatrix techniques={MOCK_TECHNIQUES} entityName="APT29" entityType="actor" />)
    const cells = screen.getAllByTestId('technique-cell')
    const highCells = cells.filter(c => c.className.includes('text-sev-critical'))
    expect(highCells.length).toBeGreaterThan(0)
  })

  it('hover shows tooltip with description (title attribute)', () => {
    render(<AttackTechniqueMatrix techniques={MOCK_TECHNIQUES} entityName="APT29" entityType="actor" />)
    const cells = screen.getAllByTestId('technique-cell')
    expect(cells[0].getAttribute('title')).toContain('T1190')
    expect(cells[0].getAttribute('title')).toContain('Exploit Public-Facing App')
  })

  it('click technique opens MITRE ATT&CK external link', () => {
    render(<AttackTechniqueMatrix techniques={MOCK_TECHNIQUES} entityName="APT29" entityType="actor" />)
    const cells = screen.getAllByTestId('technique-cell')
    expect(cells[0]).toHaveAttribute('href', 'https://attack.mitre.org/techniques/T1190/')
    expect(cells[0]).toHaveAttribute('target', '_blank')
    expect(cells[0]).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('tactic coverage summary shows correct counts', () => {
    render(<AttackTechniqueMatrix techniques={MOCK_TECHNIQUES} entityName="APT29" entityType="actor" />)
    const footer = screen.getByTestId('attack-matrix-footer')
    // 5 tactics covered (initial-access, execution, persistence, credential-access, command-and-control)
    expect(footer).toHaveTextContent('Covers 5/14 tactics')
    expect(footer).toHaveTextContent('6 techniques')
  })

  it('empty techniques array shows "No techniques mapped" message', () => {
    render(<AttackTechniqueMatrix techniques={[]} entityName="APT29" entityType="actor" />)
    expect(screen.getByTestId('attack-matrix-empty')).toHaveTextContent('No ATT&CK techniques mapped for APT29')
  })

  it('accepts string array of technique IDs and normalizes', () => {
    render(<AttackTechniqueMatrix techniques={['T1190', 'T1059']} entityName="APT29" entityType="actor" />)
    const cells = screen.getAllByTestId('technique-cell')
    expect(cells).toHaveLength(2)
  })

  it('renders MITRE ATT&CK Framework in footer', () => {
    render(<AttackTechniqueMatrix techniques={MOCK_TECHNIQUES} entityName="APT29" entityType="actor" />)
    expect(screen.getByTestId('attack-matrix-footer')).toHaveTextContent('MITRE ATT&CK Framework')
  })
})
