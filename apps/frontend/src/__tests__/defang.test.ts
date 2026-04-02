/**
 * @module __tests__/defang.test
 * @description Tests for IOC value defanging utility.
 */
import { describe, it, expect } from 'vitest'
import { defang } from '@/utils/defang'

describe('defang', () => {
  it('defangs IP addresses', () => {
    expect(defang('1.2.3.4', 'ip')).toBe('1[.]2[.]3[.]4')
    expect(defang('192.168.0.1', 'ip')).toBe('192[.]168[.]0[.]1')
  })

  it('defangs domains', () => {
    expect(defang('evil.com', 'domain')).toBe('evil[.]com')
    expect(defang('sub.evil.co.uk', 'domain')).toBe('sub[.]evil[.]co[.]uk')
  })

  it('defangs URLs (http and https)', () => {
    expect(defang('http://evil.com/login', 'url')).toBe('hxxp://evil[.]com/login')
    expect(defang('https://phish.example.com/cred', 'url')).toBe('hxxps://phish[.]example[.]com/cred')
  })

  it('returns non-defangable types as-is', () => {
    expect(defang('a'.repeat(64), 'hash_sha256')).toBe('a'.repeat(64))
    expect(defang('CVE-2024-1234', 'cve')).toBe('CVE-2024-1234')
    expect(defang('test@example.com', 'email')).toBe('test@example.com')
  })
})
