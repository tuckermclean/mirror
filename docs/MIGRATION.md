# Migration Guide

## `recordPiiRead` → `readPii` (PII audit wrapper)

`recordPiiRead` is deprecated and will be removed in the Week 6 milestone
(tracked in issue #170). It logs an access *after the fact* and cannot
guarantee the read was actually audited — the read can succeed while a later
`recordPiiRead` call is forgotten or throws.

Use `readPii()` instead: it runs the query, writes a richer audit row (including
`userId`), and returns the data only if the audit write succeeds (fail-closed).

### Replacement pattern

Replace:

```ts
const rows = await db
  .select({ transcript: interviews.transcript })
  .from(interviews)
  .where(eq(interviews.id, id));
await recordPiiRead({
  tableName: "interviews",
  rowId: id,
  fieldName: "transcript",
  accessorId: userId,
  reason,
});
```

With:

```ts
const rows = await readPii(
  () =>
    db
      .select({ transcript: interviews.transcript })
      .from(interviews)
      .where(eq(interviews.id, id)),
  { userId, accessorId: userId, tableName: "interviews", rowId: id,
    fieldName: "transcript", reason },
);
```

For the four canonical PII columns, prefer the purpose-built readers in
`src/lib/db/pii-read.ts` (`readInterviewTranscript`, `readImportRawPath`,
`readImportParsed`, `readLinkedinSnapshot`) which call `readPii()` for you.
