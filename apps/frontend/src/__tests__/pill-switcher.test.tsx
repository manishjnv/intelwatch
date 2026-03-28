/**
 * @module __tests__/pill-switcher.test
 * @description Tests for PillSwitcher shared component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { PillSwitcher } from '@/components/command-center/PillSwitcher'

const items = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta', badge: 3 },
  { id: 'c', label: 'Gamma', badge: null },
]

describe('PillSwitcher', () => {
  it('renders all pill items', () => {
    render(<PillSwitcher items={items} activeId="a" onChange={() => {}} />)
    expect(screen.getByTestId('pill-a')).toBeInTheDocument()
    expect(screen.getByTestId('pill-b')).toBeInTheDocument()
    expect(screen.getByTestId('pill-c')).toBeInTheDocument()
  })

  it('highlights the active pill', () => {
    render(<PillSwitcher items={items} activeId="b" onChange={() => {}} />)
    const active = screen.getByTestId('pill-b')
    expect(active.className).toContain('text-accent')
  })

  it('calls onChange when a pill is clicked', () => {
    const onChange = vi.fn()
    render(<PillSwitcher items={items} activeId="a" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('pill-c'))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('renders badge when present and > 0', () => {
    render(<PillSwitcher items={items} activeId="a" onChange={() => {}} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('does not render badge when null', () => {
    render(<PillSwitcher items={[{ id: 'x', label: 'X', badge: null }]} activeId="x" onChange={() => {}} />)
    const pill = screen.getByTestId('pill-x')
    expect(pill.querySelectorAll('span')).toHaveLength(0)
  })
})
