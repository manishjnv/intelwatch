# @etip/shared-utils

Shared utilities, constants, and error classes for the Enterprise Threat Intelligence Platform.

## Installation

```bash
pnpm add @etip/shared-utils
```

## Usage

```typescript
import {
  // Constants
  QUEUES, EVENTS,
  // Errors
  AppError, Errors,
  // Date helpers
  formatDate, parseDate, getDateKey, subDays, daysBetween, nowISO,
  // Crypto
  sha256, buildDedupeKey,
  // IP validation
  isPrivateIP, isValidIP, classifyIP,
  // STIX
  generateStixId, isValidStixId,
  // Async
  sleep, retryWithBackoff,
} from '@etip/shared-utils';

// Queue names — never hardcode
const queue = QUEUES.NORMALIZE; // 'etip:normalize'

// Throw structured errors
throw Errors.notFound('IOC', 'abc-123');

// Build deduplication keys
const hash = buildDedupeKey('ip', '192.168.1.1', 'tenant-1');

// Retry with exponential backoff
const data = await retryWithBackoff(() => fetchAPI(), 3, 1000);
```

## Modules

| File | Contents |
|------|----------|
| `queues.ts` | 12 canonical BullMQ queue name constants |
| `events.ts` | 18 cross-module event type constants |
| `errors.ts` | AppError class + Errors factory |
| `date-helpers.ts` | formatDate, parseDate, getDateKey, subDays, daysBetween, etc. |
| `hash.ts` | sha256, md5, buildDedupeKey |
| `ip-validation.ts` | isPrivateIP, isValidIPv4/v6, classifyIP |
| `stix-id.ts` | generateStixId, isValidStixId, extractStixType |
| `sleep.ts` | sleep, retryWithBackoff |

## Testing

```bash
pnpm test            # Run tests
pnpm test:coverage   # Run with coverage
```
