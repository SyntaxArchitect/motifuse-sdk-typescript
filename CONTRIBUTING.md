# Contributing

Thank you for improving the Motifuse TypeScript SDK.

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```bash
npm ci
npm run check
```

The public OpenAPI snapshot is the source of truth. To update it, first verify the corresponding API
change is deployed, replace `openapi/motifuse.openapi.json` from the canonical production document,
then run:

```bash
npm run openapi:generate
npm run openapi:check
```

Never edit `src/generated/schema.d.ts` manually. Keep ergonomic methods thin and map them only to
documented public operations. Do not copy Motifuse server code into this repository.

Examples use environment variables and must never contain live keys or customer documents. Pull
requests should include tests for behavior changes and a changelog entry when the developer-visible
contract changes.
