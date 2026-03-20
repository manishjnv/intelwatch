import { describe, it, expect } from 'vitest';
import { IOC_PATTERNS, isPrivateIP, isCommonDomain } from '../src/workers/ioc-patterns.js';

/** Helper: run all IOC_PATTERNS against content, return matched types */
function extractTypes(content: string): string[] {
  const types: string[] = [];
  for (const pat of IOC_PATTERNS) {
    pat.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pat.re.exec(content)) !== null) {
      types.push(pat.type);
    }
  }
  return types;
}

describe('IOC Patterns — 20+ type coverage', () => {
  describe('Hashes', () => {
    it('detects MD5', () => expect(extractTypes('hash: d41d8cd98f00b204e9800998ecf8427e')).toContain('hash_md5'));
    it('detects SHA1', () => expect(extractTypes('hash: da39a3ee5e6b4b0d3255bfef95601890afd80709')).toContain('hash_sha1'));
    it('detects SHA256', () => expect(extractTypes('hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toContain('hash_sha256'));
    it('detects SHA512', () => expect(extractTypes('hash: ' + 'a'.repeat(128))).toContain('hash_sha512'));
  });

  describe('Vulnerabilities', () => {
    it('detects CVE-2024-1234', () => expect(extractTypes('exploits CVE-2024-1234 in the wild')).toContain('cve'));
    it('detects CVE with 5-digit ID', () => expect(extractTypes('CVE-2025-12345')).toContain('cve'));
  });

  describe('MITRE ATT&CK', () => {
    it('detects technique T1059', () => expect(extractTypes('uses T1059 for execution')).toContain('mitre_technique'));
    it('detects sub-technique T1059.001', () => expect(extractTypes('T1059.001 PowerShell')).toContain('mitre_technique'));
  });

  describe('Network indicators', () => {
    it('detects IPv4', () => expect(extractTypes('C2 at 185.220.101.34')).toContain('ip'));
    it('detects defanged IP 192[.]168[.]1[.]1', () => expect(extractTypes('192[.]168[.]1[.]1')).toContain('ip'));
    it('detects CIDR 10.0.0.0/24', () => expect(extractTypes('range 10.0.0.0/24')).toContain('cidr'));
    it('detects ASN', () => expect(extractTypes('hosted on AS12345')).toContain('asn'));
    it('detects full URL', () => expect(extractTypes('download from https://evil.com/payload.exe')).toContain('url'));
    it('detects defanged URL hxxps://', () => expect(extractTypes('hxxps://evil[.]com/backdoor')).toContain('url'));
  });

  describe('Domains', () => {
    it('detects .com domain', () => expect(extractTypes('resolves to evil-c2.xyz')).toContain('domain'));
    it('detects defanged domain', () => expect(extractTypes('evil[.]com hosting malware')).toContain('domain'));
  });

  describe('Email', () => {
    it('detects email address', () => expect(extractTypes('phishing from admin@evil-corp.com')).toContain('email'));
  });

  describe('Cryptocurrency', () => {
    it('detects Bitcoin P2PKH address', () => {
      const types = extractTypes('ransom to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
      expect(types).toContain('bitcoin_address');
    });
  });

  describe('Windows artifacts', () => {
    it('detects registry key', () => {
      expect(extractTypes('persistence via HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\backdoor')).toContain('registry_key');
    });
    it('detects Windows file path', () => {
      expect(extractTypes('dropped to C:\\Users\\Public\\malware.exe')).toContain('file_path');
    });
  });

  describe('Unix paths', () => {
    it('detects suspicious /tmp path', () => {
      expect(extractTypes('script at /tmp/x86_payload.sh')).toContain('file_path');
    });
  });
});

describe('isPrivateIP', () => {
  it('rejects 10.x.x.x', () => expect(isPrivateIP('10.0.0.1')).toBe(true));
  it('rejects 172.16.x.x', () => expect(isPrivateIP('172.16.0.1')).toBe(true));
  it('rejects 192.168.x.x', () => expect(isPrivateIP('192.168.1.1')).toBe(true));
  it('rejects 127.x.x.x', () => expect(isPrivateIP('127.0.0.1')).toBe(true));
  it('rejects 169.254.x.x', () => expect(isPrivateIP('169.254.1.1')).toBe(true));
  it('rejects 0.0.0.0', () => expect(isPrivateIP('0.0.0.0')).toBe(true));
  it('accepts public IP 8.8.8.8', () => expect(isPrivateIP('8.8.8.8')).toBe(false));
  it('accepts public IP 185.220.101.34', () => expect(isPrivateIP('185.220.101.34')).toBe(false));
  it('rejects invalid IP', () => expect(isPrivateIP('999.999.999.999')).toBe(true));
});

describe('isCommonDomain', () => {
  it('filters google.com', () => expect(isCommonDomain('google.com')).toBe(true));
  it('filters subdomain of google.com', () => expect(isCommonDomain('api.google.com')).toBe(true));
  it('filters mitre.org', () => expect(isCommonDomain('mitre.org')).toBe(true));
  it('filters nist.gov', () => expect(isCommonDomain('nist.gov')).toBe(true));
  it('passes evil-c2.xyz', () => expect(isCommonDomain('evil-c2.xyz')).toBe(false));
  it('passes unknown.ru', () => expect(isCommonDomain('unknown.ru')).toBe(false));
  it('case insensitive', () => expect(isCommonDomain('GOOGLE.COM')).toBe(true));
});
