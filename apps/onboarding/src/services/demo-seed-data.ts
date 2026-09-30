/** Static demo catalog seeded by DemoSeeder (extracted to keep demo-seeder.ts under 400 lines). */

/** Demo IOC samples covering all types. */
export const DEMO_IOCS = [
  { type: 'ip', value: '185.220.101.34', severity: 'high' },
  { type: 'ip', value: '45.33.32.156', severity: 'medium' },
  { type: 'ip', value: '198.51.100.23', severity: 'low' },
  { type: 'domain', value: 'evil-phishing.example.com', severity: 'critical' },
  { type: 'domain', value: 'c2-beacon.malware.test', severity: 'high' },
  { type: 'url', value: 'https://malware-drop.example.com/payload.exe', severity: 'critical' },
  { type: 'sha256', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', severity: 'medium' },
  { type: 'md5', value: 'd41d8cd98f00b204e9800998ecf8427e', severity: 'low' },
  { type: 'email', value: 'phisher@malicious-domain.test', severity: 'high' },
  { type: 'cve', value: 'CVE-2024-21887', severity: 'critical' },
];

/** Demo threat actors. */
export const DEMO_ACTORS = [
  { name: 'APT28', aliases: ['Fancy Bear', 'Sofacy'], origin: 'Russia', description: 'Russian state-sponsored cyber espionage group.' },
  { name: 'APT29', aliases: ['Cozy Bear', 'The Dukes'], origin: 'Russia', description: 'Russian intelligence-linked group targeting government networks.' },
  { name: 'Lazarus Group', aliases: ['Hidden Cobra'], origin: 'North Korea', description: 'North Korean state-sponsored group focused on financial theft.' },
  { name: 'APT41', aliases: ['Winnti', 'Barium'], origin: 'China', description: 'Chinese dual-purpose group: espionage + financially motivated attacks.' },
  { name: 'FIN7', aliases: ['Carbanak'], origin: 'Unknown', description: 'Financially motivated threat group targeting hospitality and retail.' },
];

/** Demo malware families. */
export const DEMO_MALWARE = [
  { name: 'Emotet', type: 'trojan', severity: 'critical', description: 'Modular banking trojan turned malware distribution platform.' },
  { name: 'Cobalt Strike', type: 'framework', severity: 'high', description: 'Commercial adversary simulation tool widely abused by threat actors.' },
  { name: 'Mimikatz', type: 'tool', severity: 'high', description: 'Credential extraction tool for Windows environments.' },
  { name: 'QakBot', type: 'banking_trojan', severity: 'critical', description: 'Banking trojan with worm capabilities and ransomware delivery.' },
  { name: 'BlackCat', type: 'ransomware', severity: 'critical', description: 'Rust-based ransomware-as-a-service (ALPHV).' },
];

/** Default OSINT feeds to seed via ingestion service.
 * freeTier=true → seeded for Free plan (3 feeds).
 * freeTier=false → seeded only on Starter+ plan upgrade (all 10). */
export const DEFAULT_FEEDS: ReadonlyArray<{
  name: string; url: string; feedType: 'rss' | 'rest_api' | 'nvd';
  schedule: string; parseConfig?: Record<string, unknown>; freeTier: boolean;
}> = [
  // ── REST API feeds (JSON endpoints) — Starter+ only ────────────
  {
    name: 'AlienVault OTX',
    url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    freeTier: false,
    parseConfig: {
      responseArrayPath: 'results',
      fieldMap: { title: 'name', content: 'description', url: 'id', publishedAt: 'created' },
    },
  },
  {
    name: 'Abuse.ch URLhaus',
    url: 'https://urlhaus-api.abuse.ch/v1/urls/recent/',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    freeTier: false,
    parseConfig: {
      responseArrayPath: 'urls',
      fieldMap: { title: 'url', content: 'threat', url: 'url', publishedAt: 'date_added', sourceId: 'id' },
    },
  },
  {
    name: 'CISA KEV',
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    feedType: 'rest_api',
    schedule: '0 */4 * * *',
    freeTier: false,
    parseConfig: {
      responseArrayPath: 'vulnerabilities',
      fieldMap: { title: 'vulnerabilityName', content: 'shortDescription', sourceId: 'cveID', publishedAt: 'dateAdded' },
    },
  },
  {
    name: 'Feodo Tracker',
    url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.json',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    freeTier: false,
    parseConfig: {
      responseArrayPath: '',
      fieldMap: { title: 'ip_address', content: 'malware', publishedAt: 'first_seen_utc', sourceId: 'ip_address' },
    },
  },
  {
    name: 'MalwareBazaar Recent',
    url: 'https://mb-api.abuse.ch/api/v1/',
    feedType: 'rest_api',
    schedule: '0 */2 * * *',
    freeTier: false,
    parseConfig: {
      method: 'POST',
      body: { query: 'get_recent', selector: 100 },
      responseArrayPath: 'data',
      fieldMap: { title: 'sha256_hash', content: 'file_type', publishedAt: 'first_seen_utc', sourceId: 'sha256_hash' },
    },
  },
  // ── RSS feeds ───────────────────────────────────────────────────
  {
    name: 'CISA Advisories RSS',
    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    feedType: 'rss',
    schedule: '0 */4 * * *',
    freeTier: true,   // ★ Free tier default
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    feedType: 'rss',
    schedule: '0 */4 * * *',
    freeTier: true,   // ★ Free tier default
  },
  {
    name: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    feedType: 'rss',
    schedule: '0 */2 * * *',
    freeTier: false,
  },
  {
    name: 'US-CERT Alerts',
    url: 'https://www.us-cert.gov/ncas/alerts.xml',
    feedType: 'rss',
    schedule: '0 */2 * * *',
    freeTier: false,
  },
  // ── NVD connector (URL handled internally) ─────────────────────
  {
    name: 'NVD Recent CVEs',
    url: '',
    feedType: 'nvd',
    schedule: '0 */4 * * *',
    freeTier: true,   // ★ Free tier default
  },
];

/** Demo CVEs. */
export const DEMO_VULNS = [
  { cveId: 'CVE-2024-21887', product: 'Ivanti Connect Secure', cvssScore: 9.1, description: 'Command injection in Ivanti Connect Secure web component.' },
  { cveId: 'CVE-2024-3400', product: 'Palo Alto PAN-OS', cvssScore: 10.0, description: 'OS command injection in GlobalProtect gateway.' },
  { cveId: 'CVE-2023-44228', product: 'Apache Log4j', cvssScore: 10.0, description: 'Remote code execution via JNDI lookup in log messages.' },
  { cveId: 'CVE-2024-1709', product: 'ConnectWise ScreenConnect', cvssScore: 10.0, description: 'Authentication bypass in ConnectWise ScreenConnect.' },
  { cveId: 'CVE-2023-46805', product: 'Ivanti Policy Secure', cvssScore: 8.2, description: 'Authentication bypass in Ivanti web component.' },
];
