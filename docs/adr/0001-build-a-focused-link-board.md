# Build a focused link board with separate bearer links

We will build a focused custom product for the MVP: one mobile-first page of structured link items, with a separate unguessable read link and edit link. The reviewed hosted products did not satisfy the required combination of account-free bearer-link access, distinct read/edit handoff, link-item operations, and a convenient mobile editor; this choice keeps the product model small while preserving the intended UX.

## Considered Options

- **Hosted product**: rejected because no reviewed service met the complete access and structured-editor requirements.
- **HedgeDoc self-hosting**: retained as a fallback/reference because it provides separate editor and published URLs plus crawler metadata, but it is a Markdown pad rather than a link-item editor.

## Consequences

The MVP owns the link-item experience and bearer-link semantics. Read pages should be unlisted from search engines, while possession of a read or edit link remains the actual authority; future sections, previews, and expandable board widgets can be added without changing that access model.

Source: [research/secret-link-page-products.md](../../research/secret-link-page-products.md).
