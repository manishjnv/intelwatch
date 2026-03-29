/**
 * @module @etip/shared-auth/constants
 * @description Platform-wide constants for system tenant and super admin isolation.
 * Import these instead of hardcoding UUIDs or tenant names.
 */

/** Well-known UUID for the IntelWatch system tenant (super admin home tenant) */
export const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/** Display name for the system tenant */
export const SYSTEM_TENANT_NAME = 'IntelWatch Platform';

/** URL-safe slug for the system tenant */
export const SYSTEM_TENANT_SLUG = 'intelwatch-system';
