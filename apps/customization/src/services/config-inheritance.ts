export class ConfigInheritance {
  /** tenantId:section → default config */
  private tenantDefaults = new Map<string, Record<string, unknown>>();
  /** tenantId:userId:section → user overrides */
  private userOverrides = new Map<string, Record<string, unknown>>();

  setTenantDefaults(
    tenantId: string,
    section: string,
    defaults: Record<string, unknown>,
  ): void {
    const key = `${tenantId}:${section}`;
    this.tenantDefaults.set(key, structuredClone(defaults));
  }

  getTenantDefaults(tenantId: string, section: string): Record<string, unknown> {
    const key = `${tenantId}:${section}`;
    return structuredClone(this.tenantDefaults.get(key) ?? {});
  }

  setUserOverride(
    tenantId: string,
    userId: string,
    section: string,
    overrides: Record<string, unknown>,
  ): void {
    const key = `${tenantId}:${userId}:${section}`;
    this.userOverrides.set(key, structuredClone(overrides));
  }

  getUserOverrides(
    tenantId: string,
    userId: string,
    section: string,
  ): Record<string, unknown> {
    const key = `${tenantId}:${userId}:${section}`;
    return structuredClone(this.userOverrides.get(key) ?? {});
  }

  /**
   * Resolve final config by merging tenant defaults with user overrides.
   * User values take precedence over tenant defaults (shallow merge).
   */
  resolveConfig(
    tenantId: string,
    userId: string,
    section: string,
  ): Record<string, unknown> {
    const defaults = this.getTenantDefaults(tenantId, section);
    const overrides = this.getUserOverrides(tenantId, userId, section);
    return { ...defaults, ...overrides };
  }

  clearUserOverrides(tenantId: string, userId: string, section: string): void {
    const key = `${tenantId}:${userId}:${section}`;
    this.userOverrides.delete(key);
  }

  clearAll(tenantId: string, section: string): void {
    const tenantKey = `${tenantId}:${section}`;
    this.tenantDefaults.delete(tenantKey);

    // Clear all user overrides for this tenant+section
    for (const key of this.userOverrides.keys()) {
      if (key.startsWith(`${tenantId}:`) && key.endsWith(`:${section}`)) {
        this.userOverrides.delete(key);
      }
    }
  }
}
