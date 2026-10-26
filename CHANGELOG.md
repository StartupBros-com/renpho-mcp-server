# Changelog

This changelog starts with 1.2.1, the first tagged source release. Earlier development used package version 1.2.0 without a GitHub release. The fixes below describe changes since the pre-release source at [bede378](https://github.com/StartupBros-com/renpho-mcp-server/commit/bede378f50f4879f8c047637c4116204ca942716), not every feature already present in that source.

## 1.2.1 — 2026-10-26

### Fixed

- Login requests now include the `appVersion` and `platform` headers required by the request contract reported in [#19](https://github.com/StartupBros-com/renpho-mcp-server/issues/19). Encryption, the login payload, and numeric-only error reporting are unchanged. ([#21](https://github.com/StartupBros-com/renpho-mcp-server/pull/21))
- Measurement-history output renders every selected row instead of truncating at 20. The requested limit is still enforced by the service, up to 500 rows through the MCP tool. ([#14](https://github.com/StartupBros-com/renpho-mcp-server/pull/14))
- Classic-history pagination counts deduplicated current-user records toward the requested limit, continuing past other users' records and short newest pages. Unresolved scans fail explicitly instead of claiming empty or complete history. ([#17](https://github.com/StartupBros-com/renpho-mcp-server/pull/17))

### Maintenance

- Package metadata, MCP initialization, and health-check output report version 1.2.1.
- Diagnostics cache tests use a controlled clock. They verify cache reuse for an unchanged cutoff and a fresh scan when the cutoff advances, without depending on whether execution crosses a wall-clock second.
- Installation documentation distinguishes source releases from npm publication and corrects the Claude Code MCP configuration locations.

### Compatibility and verification limits

- This is a source release: install dependencies and build locally. It is not an npm publication and does not include a prebuilt executable.
- Node.js 18+ remains the declared runtime. No dependency versions or runtime requirements changed in this release preparation.
- Existing MorphoScan integration, multi-table discovery, and sync diagnostics are included; they were already present before these three fixes.
- Classic current-user scans retain at most 1,000 records per table and make at most six page requests. They still assume chronological pages and accurate cached device counts. An incomplete classic scan rejects combined history even when advanced measurements are available.
- Advanced scans retain their existing 1,000-record limit and explicit failure behavior for unsupported, malformed, or unsuccessful responses.
- Automated provider tests use synthetic encrypted responses and mocked fetch. Live login and device/account compatibility were not independently verified for this release. [#11](https://github.com/StartupBros-com/renpho-mcp-server/issues/11), [#18](https://github.com/StartupBros-com/renpho-mcp-server/issues/18), and [#19](https://github.com/StartupBros-com/renpho-mcp-server/issues/19) remain acceptance follow-ups.
