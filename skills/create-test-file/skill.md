# Skill: Create Test File — OrderFlow

## When to use

Use this skill whenever you need to create a new Jest unit test file in this project.

---

## Standard test file template

```typescript
import { jest } from '@jest/globals';

// Import the module under test
import { MyService } from './my.service';

// Import shared test utilities
import { createMockLogger } from '@orderflow/testing-utils';

// Mock external dependencies at module level
jest.mock('@orderflow/logger', () => ({
  logger: createMockLogger(),
}));

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MyService(/* inject mocked deps */);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('methodName', () => {
    it('should_[expectedBehavior]_when_[condition]', async () => {
      // Arrange
      const input = {
        /* test data from @orderflow/testing-utils factories */
      };
      const expected = {
        /* expected output */
      };

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toEqual(expected);
    });

    it('should_throw_AppError_when_[invalid condition]', async () => {
      // Arrange
      const invalidInput = {
        /* invalid data */
      };

      // Act & Assert
      await expect(service.methodName(invalidInput)).rejects.toMatchObject({
        message: 'Expected error message',
        statusCode: 400,
      });
    });
  });
});
```

---

## Mocking AWS SDK (use aws-sdk-client-mock)

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';

const ebMock = mockClient(EventBridgeClient);

beforeEach(() => {
  ebMock.reset();
});

it('should_publish_event_when_order_created', async () => {
  ebMock
    .on(PutEventsCommand)
    .resolves({ FailedEntryCount: 0, Entries: [{ EventId: 'abc' }] });

  await service.createOrder({
    /* ... */
  });

  expect(ebMock.calls()).toHaveLength(1);
});
```

---

## Mocking Prisma

```typescript
import { createMockPrisma } from '@orderflow/testing-utils';

const mockPrisma = createMockPrisma();

// mockPrisma.order.findMany.mockResolvedValue([...])
// mockPrisma.order.create.mockResolvedValue({ id: 'uuid', ... })
```

---

## File naming convention

- Unit test: `src/app/services/order.service.spec.ts` (alongside source)
- Integration test: `test/integration/orders.integration.spec.ts`
- Never suffix with `.test.ts` — always use `.spec.ts`

---

## Coverage requirements

Run after writing tests to verify 80% threshold:

```bash
npx nx test order-service --coverage
```

Target: branches ≥ 80%, functions ≥ 80%, lines ≥ 80%, statements ≥ 80%
