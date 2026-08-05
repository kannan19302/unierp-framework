# unierp-framework

**Layer L2** of the UniERP layered repository architecture
(`PLATFORM_ARCHITECTURE.md` § 4.2). Publishes @unerp/framework.

## Why it is its own repository

The schema-driven page runtime. First-party and customer modules render through the SAME runtime, so it must be a published artifact rather than an internal folder — that is what turns it from a convenience into a public guarantee (§ 8.1).

## The invariant

**A repository may depend only on published artifacts of a strictly lower
layer. Never sideways within a layer. Never upward.** A cycle is not
discouraged — it is unrepresentable, because the lower layer's package cannot
name the higher one.

## Extraction status

Extracted from the `ERPSys` monorepo as § 14 Phase 3, with history preserved
via `git-filter-repo`.

**The monorepo copy remains authoritative.** Consumers switch to published
packages only once those packages are publishable; the monorepo stays buildable
at each extraction tag until they do. Rollback is a one-line `pnpm` override
pointing consumers back at the workspace path.
