# Contributing to unierp-framework

This repository is **L2 — Runtime** in the UniERP layered architecture.
It may depend on **L0, L1**, and nothing else.

## The rule that matters most here

Because customer modules render through it, it must be a published artifact rather than an internal folder — that is what turns it from a convenience into a public guarantee.

## Before you push

```bash
npm install
node scripts/check-layer.mjs   # if present: asserts the layer rule
npx tsc --noEmit
```

A dependency on a higher or sideways layer will fail CI. That is deliberate: the
whole reason this is a polyrepo rather than a monorepo is that the boundary
becomes impossible to cross rather than merely discouraged.

## Standards

See [`unierp-platform/CONTRIBUTING.md`](../unierp-platform/CONTRIBUTING.md) for
the platform-wide non-negotiables — tenant isolation, route guards, money as
Decimal, and never suppressing a check to make it pass.
