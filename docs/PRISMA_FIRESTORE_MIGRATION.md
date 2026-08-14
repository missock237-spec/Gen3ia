# Prisma → Firestore Migration Guide

> Goal: remove every remaining Prisma reference from `src/`, route all data
> access through the Firestore facade, and reach `tsc && lint && vitest` green.

## 1. Context

Gen3ia migrated its data layer from Prisma/PostgreSQL to Firebase Admin SDK /
Cloud Firestore. The migration is **largely complete at the import level**:
no `.ts`/`.tsx` source file imports `@prisma/client` directly anymore.

What remains is:

- Stale comments / docstrings mentioning "Prisma".
- Test files that mock a `mockPrisma` object instead of the Firestore facade.
- One defensive `error.name === 'PrismaClientKnownRequestError'` check in
  `src/lib/api-error.ts`.
- `package.json.backup` and `package-lock.json` still list `@prisma/client`
  (the lockfile will regenerate once `package.json` no longer depends on it;
  the backup file is harmless but should be deleted for cleanliness).

## 2. The Firestore facade API

Defined in [`src/lib/firebase/firestore.ts`](src/lib/firebase/firestore.ts) and
extended in [`src/lib/firestore-extra.ts`](src/lib/firestore-extra.ts).

### 2.1 Public surface

```ts
// src/lib/db.ts  (and src/lib/prisma.ts — same shim)
import { db, prisma } from '@/lib/db';
// `prisma` is just an alias for `db`. Both work identically.

// Repositories are exposed as db.<model> — same shape as Prisma Client:
db.user.findUnique({ where: { id: uid } });
db.user.findMany({
  where: [{ field: 'email', op: '==', value: 'a@b.c' }],
  orderBy: [{ field: 'createdAt', direction: 'desc' }],
  limit: 10,
  select: ['id', 'email'],
});
db.user.create({ data: { email, role } });
db.user.update({ where: { id: uid }, data: { lastLoginAt: new Date() } });
db.user.upsert({ where: { id: uid }, create: {...}, update: {...} });
db.user.delete({ where: { id: uid } });
db.user.deleteMany({ where: [{ field: 'status', op: '==', value: 'archived' }] });
db.user.count({ where: [...] });
db.user.aggregate({ where: [...], _sum: { credits: true }, _count: { _all: true } });
await db.$transaction(async () => { /* unit of work */ });
```

### 2.2 Available models

Defined in [`Collections`](src/lib/firebase/firestore.ts) and extended in
[`firestore-extra.ts`](src/lib/firestore-extra.ts):

| Accessor                  | Firestore collection         |
| ------------------------- | ---------------------------- |
| `db.user`, `db.profile`   | `users`                      |
| `db.agent`                | `agents`                     |
| `db.agentSuite`           | `agent_suites`               |
| `db.agentMemory`          | `agent_memories`             |
| `db.agentUsage`           | `agent_usage`                |
| `db.agentPermission`      | `agent_permissions`          |
| `db.agentExecution`       | `agent_executions`           |
| `db.agentInvocation`      | `agent_invocations`          |
| `db.conversation`         | `conversations`              |
| `db.message`              | `messages`                   |
| `db.credit`               | `credits`                    |
| `db.creditTransaction`    | `credit_transactions`        |
| `db.subscription`         | `subscriptions`              |
| `db.invoice`              | `invoices`                   |
| `db.apiKey`               | `api_keys`                   |
| `db.mCPConnector`         | `mcp_connectors`             |
| `db.task`                 | `tasks`                      |
| `db.workflow`             | `workflows`                  |
| `db.workflowBranch`       | `workflow_branches`          |
| `db.workflowVersion`      | `workflow_versions`          |
| `db.workflowTemplate`     | `workflow_templates`         |
| `db.guardrail`            | `guardrails`                 |
| `db.notification`         | `notifications`              |
| `db.auditLog`             | `audit_logs`                 |
| `db.improvementLog`       | `improvement_logs`           |
| `db.aICost` / `db.aiCost` | `ai_costs`                   |
| `db.monitoringEvent`      | `monitoring_events`          |
| `db.usageDaily`           | `usage_daily`                |
| `db.feedback`             | `feedback`                   |
| `db.socialAccount`        | `social_accounts`            |
| `db.webhook`              | `webhooks`                   |
| `db.marketplaceListing`   | `marketplace_listings`       |
| `db.marketplacePurchase`  | `marketplace_purchases`      |
| `db.marketplaceReview`    | `marketplace_reviews`        |
| `db.uploadedFile`         | `uploaded_files`             |
| `db.partner`              | `partners`                   |
| `db.partnerEvent`         | `partner_events`             |
| `db.activityLog`          | `activity_logs`              |
| `db.alertRule`            | `alert_rules`                |
| `db.alertEvent`           | `alert_events`               |
| `db.agentDelegation`      | `agent_delegations`          |
| `db.session`              | `sessions`                   |
| `db.terminalSession`      | `terminal_sessions`          |

### 2.3 `where` clause shape

Prisma's `where: { field: value }` object syntax is **NOT** supported. Use
the array form instead:

```ts
// ❌ Prisma-style (will fail type-check)
db.user.findMany({ where: { email: 'a@b.c' } });

// ✅ Firestore facade
db.user.findMany({
  where: [{ field: 'email', op: '==', value: 'a@b.c' }],
});
```

Supported `op` values: `'==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any'`.

### 2.4 `select` clause

Same as Prisma — `select: ['id', 'email', 'createdAt']` projects fields
client-side. ID is always included.

### 2.5 Sub-collections

```ts
const messagesRepo = db.conversation.subcollection(convId, 'messages');
await messagesRepo.create({ data: { role: 'user', content: 'hi' } });
```

### 2.6 Transactions

`db.$transaction(fn)` is a no-op wrapper — Firestore transactions are
emulated by running the callback sequentially. Don't rely on rollback.

## 3. Migration procedure per file

Run `bash scripts/scan-prisma-usage.sh src` to get the current list of files
still matching Prisma patterns.

For each file:

1. **Imports** — replace any direct Prisma import:
   ```diff
   - import { PrismaClient } from '@prisma/client';
   - import { prisma } from '@prisma/client';
   + import { db, prisma } from '@/lib/db';
   ```
   Files using `import { db } from '@/lib/db'` or
   `import { prisma } from '@/lib/prisma'` are **already correct** — leave
   them.

2. **Where clauses** — convert object form to array form (see §2.3).

3. **Comments / docstrings** — replace "Prisma" with "Firestore" in
   descriptive text. Examples:
   ```diff
   - * persists them to the MonitoringEvent table via Prisma.
   + * persists them to the monitoring_events Firestore collection.
   ```

4. **Error handling** — `src/lib/api-error.ts` has a defensive check
   `error.name === 'PrismaClientKnownRequestError'`. Replace with a
   Firestore-aware check, or simply remove it (the generic `Error` branch
   already covers DB errors).

5. **Test mocks** — replace `mockPrisma = { user: { findUnique: jest.fn() } }`
   with a stub of the Firestore facade shape. The test just needs to return
   the same data; the call signature is the same.

## 4. Files NOT to migrate

- `package.json.backup` — backup file, will be deleted in cleanup pass.
- `schema_backup.prisma` — historical Prisma schema, kept for reference.
- `scripts/scan-prisma-usage.sh` — this scan script itself mentions "Prisma"
  by design.

## 5. Validation gates

After each batch of edits, run:

```bash
npx tsc --noEmit
npx eslint .
npx vitest run
```

All three must pass before pushing.

## 6. After migration

- Delete `package.json.backup` and `schema_backup.prisma`.
- Remove `@prisma/client` from `devDependencies` if it lingers.
- Commit with message:
  `refactor(data): finish Prisma→Firestore migration — all src/ files use the Firestore facade, tsc/lint/vitest green`
- Push to `main`.
