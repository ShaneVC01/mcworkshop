---
type: doc
status: draft
tags: [supabase, migrations, edge-functions, placeholder]
relatedTo: []
---

# Supabase (placeholder)

Nothing here is connected in phase 1. The prototype runs entirely on mock data in `src/data/mock`.

- `migrations/` will hold SQL migrations. No tables exist yet and none should be created without approval.
- `functions/` will hold Edge Functions for the NetSuite sync (SuiteQL reads) and the outbox writer.

See [supabase-handover.md](../docs/supabase-handover.md) for what each data function becomes and [netsuite-mapping.md](../docs/netsuite-mapping.md) for the record mapping.
