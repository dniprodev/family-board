# Domain Docs

This is a single-context repository.

## Before exploring

Read these documents when they exist:

- `CONTEXT.md` at the repository root.
- Relevant decisions in `docs/adr/`.

If these documents do not exist, proceed without flagging their absence. Create them lazily when domain terms or important decisions are resolved.

## File structure

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── ...
└── src/
```

## Vocabulary

Use the domain terms defined in `CONTEXT.md` in issue titles, specifications, tests, and implementation notes. If a needed concept is not defined, resolve the terminology before introducing competing synonyms.

## ADR conflicts

If new work contradicts an existing ADR, identify the conflict explicitly rather than silently overriding it.
