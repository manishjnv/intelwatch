import { describe, it, expect, beforeEach } from 'vitest';
import { ExtractionService, type CTIExtractionResult } from '../src/services/extraction.js';

describe('ExtractionService', () => {
  let service: ExtractionService;

  beforeEach(() => {
    service = new ExtractionService();
    // No API key — uses regex-only mode
    service.init(undefined);
  });

  describe('regex-only extraction', () => {
    it('extracts MITRE techniques', async () => {
      const result = await service.extract(
        'APT29 Campaign',
        'The group used T1059.001 (PowerShell) and T1021.002 (SMB) for lateral movement.',
        'https://example.com',
      );
      expect(result.mitreTechniques).toContain('T1059.001');
      expect(result.mitreTechniques).toContain('T1021.002');
      expect(result.extractionMode).toBe('regex_only');
    });

    it('extracts CVE identifiers', async () => {
      const result = await service.extract(
        'Vulnerability Advisory',
        'Critical vulnerability CVE-2024-1234 and CVE-2025-56789 exploited in the wild.',
        'https://example.com',
      );
      expect(result.vulnerabilities).toContain('CVE-2024-1234');
      expect(result.vulnerabilities).toContain('CVE-2025-56789');
    });

    it('extracts known threat actor names', async () => {
      const result = await service.extract(
        'APT Report',
        'APT29 (Cozy Bear) and Lazarus Group targeted healthcare in Q1.',
        'https://example.com',
      );
      expect(result.threatActors).toContain('APT29');
      expect(result.threatActors).toContain('Lazarus');
    });

    it('extracts malware family names', async () => {
      const result = await service.extract(
        'Malware Analysis',
        'The dropper deployed Cobalt Strike beacons and IcedID loader.',
        'https://example.com',
      );
      expect(result.malwareFamilies).toContain('Cobalt Strike');
      expect(result.malwareFamilies).toContain('IcedID');
    });

    it('extracts target industries', async () => {
      const result = await service.extract(
        'Industry Alert',
        'Ransomware gang targets healthcare and financial institutions.',
        'https://example.com',
      );
      expect(result.targetIndustries).toContain('healthcare');
      expect(result.targetIndustries).toContain('financial');
    });

    it('extracts target regions', async () => {
      const result = await service.extract(
        'Geo Alert',
        'Campaign focused on North America and Europe. Attributed to Iran.',
        'https://example.com',
      );
      expect(result.targetRegions).toContain('North America');
      expect(result.targetRegions).toContain('Europe');
      expect(result.targetRegions).toContain('Iran');
    });

    it('defaults TLP to AMBER', async () => {
      const result = await service.extract('Test', 'No TLP mentioned.', 'https://example.com');
      expect(result.tlp).toBe('AMBER');
    });

    it('returns zero tokens for regex mode', async () => {
      const result = await service.extract('Test', 'content', 'https://example.com');
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it('returns empty arrays for non-CTI content', async () => {
      const result = await service.extract(
        'Company Earnings',
        'Revenue grew 15% year over year. The board approved a dividend.',
        'https://example.com',
      );
      expect(result.threatActors).toHaveLength(0);
      expect(result.malwareFamilies).toHaveLength(0);
      expect(result.mitreTechniques).toHaveLength(0);
      expect(result.vulnerabilities).toHaveLength(0);
    });

    it('extracts Typhoon actor variants', async () => {
      const result = await service.extract(
        'China Nexus',
        'Volt Typhoon and Salt Typhoon compromised telecom infrastructure.',
        'https://example.com',
      );
      expect(result.threatActors).toContain('Volt Typhoon');
      expect(result.threatActors).toContain('Salt Typhoon');
    });

    it('extracts ransomware group names', async () => {
      const result = await service.extract(
        'Ransomware Watch',
        'LockBit and Cl0p claimed 200+ victims this month. Akira targets SMBs.',
        'https://example.com',
      );
      expect(result.threatActors).toContain('LockBit');
      expect(result.threatActors).toContain('Cl0p');
      expect(result.threatActors).toContain('Akira');
    });

    it('extracts FIN and UNC groups', async () => {
      const result = await service.extract(
        'Financial Threats',
        'FIN7 and UNC3886 observed using novel TTPs.',
        'https://example.com',
      );
      expect(result.threatActors).toContain('FIN7');
      expect(result.threatActors).toContain('UNC3886');
    });

    it('extracts C2 framework names', async () => {
      const result = await service.extract(
        'C2 Report',
        'Operators shifted from Cobalt Strike to Sliver and Brute Ratel.',
        'https://example.com',
      );
      expect(result.malwareFamilies).toContain('Cobalt Strike');
      expect(result.malwareFamilies).toContain('Sliver');
      expect(result.malwareFamilies).toContain('Brute Ratel');
    });
  });

  describe('parseExtractionResponse', () => {
    it('parses valid Sonnet JSON response', () => {
      const json = JSON.stringify({
        iocs: [{ type: 'ip', value: '185.220.101.34', context: 'C2 server at 185.220.101.34' }],
        threat_actors: ['APT29'],
        malware_families: ['Cobalt Strike'],
        mitre_techniques: ['T1059.001'],
        campaigns: ['SolarWinds'],
        vulnerabilities: ['CVE-2024-1234'],
        target_industries: ['government'],
        target_regions: ['North America'],
        summary: 'APT29 deployed Cobalt Strike via CVE-2024-1234.',
        tlp: 'RED',
      });
      const result = service.parseExtractionResponse(json);
      expect(result.iocs).toHaveLength(1);
      expect(result.iocs[0].value).toBe('185.220.101.34');
      expect(result.threatActors).toContain('APT29');
      expect(result.malwareFamilies).toContain('Cobalt Strike');
      expect(result.mitreTechniques).toContain('T1059.001');
      expect(result.campaigns).toContain('SolarWinds');
      expect(result.tlp).toBe('RED');
      expect(result.summary).toContain('APT29');
    });

    it('handles markdown-wrapped JSON', () => {
      const json = '```json\n{"iocs": [], "threat_actors": ["APT28"], "malware_families": [], "mitre_techniques": [], "campaigns": [], "vulnerabilities": [], "target_industries": [], "target_regions": [], "summary": "Test.", "tlp": "GREEN"}\n```';
      const result = service.parseExtractionResponse(json);
      expect(result.threatActors).toContain('APT28');
      expect(result.tlp).toBe('GREEN');
    });

    it('filters invalid MITRE techniques', () => {
      const json = JSON.stringify({
        iocs: [], threat_actors: [], malware_families: [],
        mitre_techniques: ['T1059.001', 'invalid', 'T9999'],
        campaigns: [], vulnerabilities: [], target_industries: [],
        target_regions: [], summary: '', tlp: 'AMBER',
      });
      const result = service.parseExtractionResponse(json);
      expect(result.mitreTechniques).toContain('T1059.001');
      expect(result.mitreTechniques).toContain('T9999');
      expect(result.mitreTechniques).not.toContain('invalid');
    });

    it('returns empty result for unparseable JSON', () => {
      const noop = (): void => {};
      const loggerService = new ExtractionService();
      const logger = { info: noop, warn: noop, error: noop, debug: noop, fatal: noop, child: () => logger } as never;
      loggerService.init(undefined, logger);
      const result = loggerService.parseExtractionResponse('not json at all');
      expect(result.iocs).toHaveLength(0);
      expect(result.threatActors).toHaveLength(0);
      expect(result.extractionMode).toBe('sonnet');
    });
  });
});
