# Skill: Generate Prisma Migration — OrderFlow

## When to use

Use this skill when a ticket requires changes to the database schema
(new model, new field, new index, constraint change).

---

## Safety Rules (YOU MUST follow all of these)

1. **Never use `DROP TABLE` or `DROP COLUMN`** — only additive changes in agents
2. **Never add `NOT NULL` column without a `@default` on an existing table** — will fail on existing data
3. **Always create the migration in dev first** — never run `migrate deploy` directly
4. **Always generate the Prisma client after schema changes**
5. **STOP and wait for human confirmation before `prisma migrate deploy`**

---

## Step-by-step process

### 1. Edit the schema file

File: `apps/order-service/prisma/schema.prisma`

Example — adding a new optional field:

```prisma
model Order {
  // ... existing fields ...
  cancelReason  String?    // ← new optional field (safe — nullable)
  cancelledAt   DateTime?  // ← new optional field (safe — nullable)
}
```

Example — adding a new model:

```prisma
model OrderNote {
  id        String   @id @default(uuid())
  orderId   String
  content   String
  createdAt DateTime @default(now())
  order     Order    @relation(fields: [orderId], references: [id])

  @@index([orderId])
  @@map("order_notes")
}
```

### 2. Create the migration (dev only)

```bash
cd apps/order-service  # if running from service dir, or use Nx:
npx nx run order-service:db:migrate --name TICKET_ID-describe-change
# OR directly:
DATABASE_URL="postgresql://orderflow:orderflow@localhost:5432/orderflow_dev" \
  npx prisma migrate dev --name JIRA-456-add-cancel-reason \
  --schema apps/order-service/prisma/schema.prisma
```

### 3. Generate updated Prisma client

```bash
npx prisma generate --schema apps/order-service/prisma/schema.prisma
```

This regenerates `@prisma/client` TypeScript types.

### 4. Verify migration file

Check `apps/order-service/prisma/migrations/{timestamp}_{name}/migration.sql`

The SQL must NOT contain:

- `DROP TABLE`
- `DROP COLUMN`
- `ALTER COLUMN ... SET NOT NULL` without a prior `UPDATE` statement

### 5. STOP — human approval required for `migrate deploy`

Output:

```
MIGRATION CREATED: apps/order-service/prisma/migrations/{timestamp}_{name}/
SQL preview:
[paste migration.sql content]

⚠️  Human action required: Run `prisma migrate deploy` on staging/prod.
    This is blocked for agents per .cloud/permissions.yaml.
```

---

## Rollback strategy

Prisma does not support automatic rollback. For each migration, also create:
`apps/order-service/prisma/migrations/{timestamp}_{name}/rollback.sql`

Example rollback for adding a nullable column:

```sql
ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancel_reason";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancelled_at";
```
