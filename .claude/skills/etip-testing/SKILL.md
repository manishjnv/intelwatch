---
name: etip-testing
description: Apply when writing or modifying tests for any ETIP module
---

# ETIP Testing Patterns

## Framework
- Unit/Integration: Vitest
- API testing: supertest with Fastify inject
- Mocking: vitest built-in mocks

## File Naming
- `{feature}.test.ts` — unit tests
- `{feature}.integration.test.ts` — integration tests
- Place in `__tests__/` directory of the module

## Test Structure
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('{ServiceName}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('{methodName}', () => {
    it('should {expected behavior} when {condition}', async () => {
      // Arrange
      // Act
      // Assert
    });

    it('should throw AppError when {error condition}', async () => {
      await expect(service.method(badInput))
        .rejects.toThrow(AppError);
    });
  });
});
```

## Required Test Cases Per Feature
1. Happy path (valid input → expected output)
2. Validation error (invalid input → Zod error / 400)
3. Not found (missing resource → AppError 404)
4. Unauthorized (no token → 401)
5. Forbidden (wrong role → 403)
6. Edge cases specific to the feature

## Testing Routes (Fastify inject)
```typescript
import Fastify from 'fastify';
import routes from '../src/routes/entity';

const buildApp = () => {
  const app = Fastify();
  app.register(routes);
  return app;
};

it('should return 200 with valid request', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/health',
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty('status', 'ok');
});
```

## Mocking Services
```typescript
vi.mock('../src/services/entity.service', () => ({
  EntityService: {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
  },
}));
```

## Testing Rules
- Write tests FIRST (TDD red-green)
- Never commit with failing tests
- Mock external services (DB, Redis, APIs)
- Test Zod schemas directly for validation coverage
- Target >80% coverage per module
- `make test` must pass before any commit
