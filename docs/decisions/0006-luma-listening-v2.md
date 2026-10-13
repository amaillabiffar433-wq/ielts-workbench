# ADR 0006: Luma display name and Listening module v2

Accepted 2026-09-19. Luma replaces user-facing branding; application identifier, workspace filename, backup format identifiers, existing IDs, SQLite tables, setting keys and managed-note markers remain compatible.

Real Listening material requires multiple-choice groups, matching options and original diagram/table context. Listening schemaVersion 2 enables the already validated shared question/context primitives. V1 remains readable and retains its original restrictions. An optional untimed transcriptText is displayed only in Study; it creates no invented sentence timestamps. The manifest stays v1 with one immutable Test per pack.

Real source imports create versioned pack IDs; existing fragment packs and historical sessions are preserved. Source answer keys remain the authority, with no model-generated alternatives or Band estimates.
