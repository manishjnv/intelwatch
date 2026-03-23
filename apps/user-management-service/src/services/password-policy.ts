import { AppError } from '@etip/shared-utils';
import type { PasswordPolicy } from '../schemas/user-management.js';

/** Password validation result. */
export interface PasswordValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

/**
 * In-memory password policy service.
 * Manages per-tenant password strength requirements and validates passwords.
 */
export class PasswordPolicyService {
  private policies = new Map<string, PasswordPolicy>();
  private passwordHistory = new Map<string, string[]>();

  /** Default policy applied when no tenant-specific policy exists. */
  private static readonly DEFAULT_POLICY: PasswordPolicy = {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAgeDays: 90,
    preventReuse: 5,
  };

  /** Set password policy for a tenant. */
  setPolicy(tenantId: string, policy: PasswordPolicy): PasswordPolicy {
    this.policies.set(tenantId, policy);
    return policy;
  }

  /** Get password policy for a tenant. */
  getPolicy(tenantId: string): PasswordPolicy {
    return this.policies.get(tenantId) ?? PasswordPolicyService.DEFAULT_POLICY;
  }

  /** Validate a password against a tenant's policy. */
  validate(password: string, tenantId: string, userId?: string): PasswordValidationResult {
    const policy = this.getPolicy(tenantId);
    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= policy.minLength) {
      score += 25;
    } else {
      errors.push(`Password must be at least ${policy.minLength} characters`);
    }

    // Uppercase check
    if (policy.requireUppercase) {
      if (/[A-Z]/.test(password)) {
        score += 15;
      } else {
        errors.push('Password must contain at least one uppercase letter');
      }
    } else {
      score += 15;
    }

    // Lowercase check
    if (policy.requireLowercase) {
      if (/[a-z]/.test(password)) {
        score += 15;
      } else {
        errors.push('Password must contain at least one lowercase letter');
      }
    } else {
      score += 15;
    }

    // Numbers check
    if (policy.requireNumbers) {
      if (/\d/.test(password)) {
        score += 15;
      } else {
        errors.push('Password must contain at least one number');
      }
    } else {
      score += 15;
    }

    // Special characters check
    if (policy.requireSpecialChars) {
      if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
        score += 15;
      } else {
        errors.push('Password must contain at least one special character');
      }
    } else {
      score += 15;
    }

    // Bonus for extra length
    if (password.length >= 16) score += 5;
    if (password.length >= 20) score += 5;
    if (password.length >= 24) score += 5;

    // Common pattern checks
    if (/(.)\1{2,}/.test(password)) {
      score -= 10;
      errors.push('Password should not contain repeated characters');
    }
    if (/^(123|abc|qwerty|password|letmein)/i.test(password)) {
      score -= 20;
      errors.push('Password is too common');
    }

    // Password history check (reuse prevention)
    if (userId && policy.preventReuse > 0) {
      const history = this.passwordHistory.get(this.historyKey(userId, tenantId)) ?? [];
      if (history.includes(password)) {
        errors.push(`Password was used recently (last ${policy.preventReuse} passwords are blocked)`);
      }
    }

    score = Math.max(0, Math.min(100, score));
    const strength = this.scoreToStrength(score);

    return { valid: errors.length === 0, score, errors, strength };
  }

  /** Record a password in the history for reuse prevention. */
  recordPassword(userId: string, tenantId: string, password: string): void {
    const policy = this.getPolicy(tenantId);
    const key = this.historyKey(userId, tenantId);
    const history = this.passwordHistory.get(key) ?? [];
    history.unshift(password);
    if (history.length > policy.preventReuse) {
      history.length = policy.preventReuse;
    }
    this.passwordHistory.set(key, history);
  }

  /** Validate password and throw if invalid. */
  validateOrThrow(password: string, tenantId: string, userId?: string): void {
    const result = this.validate(password, tenantId, userId);
    if (!result.valid) {
      throw new AppError(400, `Password does not meet policy: ${result.errors.join('; ')}`, 'PASSWORD_POLICY_VIOLATION', {
        errors: result.errors,
        score: result.score,
        strength: result.strength,
      });
    }
  }

  private historyKey(userId: string, tenantId: string): string {
    return `${tenantId}:${userId}`;
  }

  private scoreToStrength(score: number): 'weak' | 'fair' | 'good' | 'strong' {
    if (score >= 85) return 'strong';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    return 'weak';
  }
}
