# Changelog

All notable SDK changes are recorded here. The SDK follows Semantic Versioning; its package version
is independent from the Motifuse `/api/v1` version.

## [1.1.0-beta.3](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/compare/v1.0.0-beta.3...v1.1.0-beta.3) (2026-09-01)


### Features

* publish Motifuse TypeScript SDK release candidate ([4f032d5](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/commit/4f032d534d3a20d80d629f9a6b8e0f89500e6ecc))


### Bug Fixes

* make generated contract checks CRLF-safe ([#12](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/issues/12)) ([7cd0f4a](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/commit/7cd0f4a408c76301688cb09587e388eb03d9b765))
* sync API contract and typed array uploads ([#10](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/issues/10)) ([7162b7f](https://github.com/SyntaxArchitect/motifuse-sdk-typescript/commit/7162b7f5b37bcb7531e3eb95dbff18bcb6176966))

## [1.0.0-beta.3] - 2026-08-27

### Fixed

- Kept Node.js `Buffer` and generic `Uint8Array<ArrayBufferLike>` upload bodies type-safe for
  consumers using newer TypeScript DOM declarations.
- Synchronized generated models and executable request examples with the corrected Motifuse
  production OpenAPI contract.

## [1.0.0-beta.2] - 2026-08-24

### Changed

- Replaced bootstrap-era npm publication messaging with the live public package status.
- Authorized the official GitHub release workflow as the package's OIDC Trusted Publisher.
- Added a guarded manual prerelease path to the same release workflow; normal releases remain
  release-please driven.

## [1.0.0-beta.1] - 2026-08-24

### Added

- Initial generated OpenAPI model layer and ergonomic `Motifuse` client.
- DocForge templates and generation workflows.
- Reconova direct file upload, profiling jobs, cleaning, and downloads.
- Spectrace projects, version uploads, comparisons, findings, review, export, and jobs.
- Safe retries, automatic and explicit idempotency, pagination iterators, job waiting, response
  metadata, RFC 9457 errors, and raw-body webhook signature verification.
- ESM package output for Node.js 20 and newer with zero runtime dependencies.

[1.0.0-beta.2]: https://github.com/SyntaxArchitect/motifuse-sdk-typescript/releases/tag/v1.0.0-beta.2
[1.0.0-beta.3]: https://github.com/SyntaxArchitect/motifuse-sdk-typescript/releases/tag/v1.0.0-beta.3
[1.0.0-beta.1]: https://github.com/SyntaxArchitect/motifuse-sdk-typescript/releases/tag/v1.0.0-beta.1
