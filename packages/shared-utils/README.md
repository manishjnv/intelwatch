# @etip/shared-utils

Shared utilities, constants, and error classes for the Enterprise Threat Intelligence Platform.

## Usage

```typescript
import {
  QUEUES, EVENTS, AppError, Errors,
  sha256, buildDedupeKey, isPrivateIP, isValidIP,
  formatDate, subDays, generateStixId, sleep, retryWithBackoff,
} from '@etip/shared-utils';
```

## Modules

| File | Contents |
|------|----------|
| `queues.ts` | 12 canonical BullMQ queue name constants |
| `events.ts` | 18 cross-module event type constants |
| `errors.ts` | AppError class + Errors factory |
| `date-helpers.ts` | formatDate, parseDate, getDateKey, subDays, daysBetween |
| `hash.ts` | sha256, md5, buildDedupeKey |
| `ip-validation.ts` | isPrivateIP, isValidIPv4/v6, classifyIP |
| `stix-id.ts` | generateStixId, isValidStixId, extractStixType |
| `sleep.ts` | sleep, retryWithBackoff |
