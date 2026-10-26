# Renpho MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that provides access to body composition data from Renpho smart scales. Query your weight, body fat, muscle mass, and other health metrics directly from Claude, Cursor, or any MCP-compatible client.

## Features

- **Body Composition Data**: Weight, BMI, body fat %, muscle mass, water %, bone mass, visceral fat, metabolic age, BMR, and more
- **Weight Trends**: Track changes over customizable time periods (7-365 days)
- **Health Classifications**: Automatic BMI, body fat, and visceral fat category assessments
- **Measurement History**: Access historical measurements with date filtering
- **MorphoScan history integration**: Combines classic and eight-electrode records, retaining numerical advanced metrics under their API field names and merging complementary metadata only for confirmed duplicates
- **Multi-table discovery**: Scans all linked Renpho scale tables instead of assuming the first discovered scale-user ID is always correct
- **Sync diagnostics**: Inspect linked scale-user IDs, hidden measurements, and likely delayed Wi-Fi sync situations
- **Secure**: Credentials stored as environment variables, never logged

## Requirements

- Node.js 18+
- A [Renpho Health](https://renpho.com) account with connected smart scale
- **Important**: This works with the **Renpho Health** app (blue icon), not the legacy Renpho app

## Installation

Releases are distributed as source code on [GitHub](https://github.com/StartupBros-com/renpho-mcp-server/releases), not as an npm package. Install dependencies and build locally. For a pinned release, add `--branch v1.2.1` to the clone command below; omit it to use the latest `main`. See [CHANGELOG.md](CHANGELOG.md) for changes and compatibility limits.

```bash
git clone https://github.com/StartupBros-com/renpho-mcp-server.git
cd renpho-mcp-server
npm install
npm run build
```

## Configuration

Create a `.env` file (or set environment variables):

```bash
RENPHO_EMAIL=your-email@example.com
RENPHO_PASSWORD=your-password
```

### Claude Code

Add the server to `~/.claude.json` for user-wide configuration, or `.mcp.json` in your client project's root for project-scoped configuration—not `settings.json`. See [Claude Code's MCP documentation](https://code.claude.com/docs/en/mcp).

The example below reads credentials from the environment that launches Claude Code. Set `RENPHO_EMAIL` and `RENPHO_PASSWORD` there; do not commit real credentials in a project-scoped `.mcp.json`.

```json
{
  "mcpServers": {
    "renpho": {
      "command": "node",
      "args": ["/path/to/renpho-mcp-server/dist/index.js"],
      "env": {
        "RENPHO_EMAIL": "${RENPHO_EMAIL}",
        "RENPHO_PASSWORD": "${RENPHO_PASSWORD}"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "renpho": {
      "command": "node",
      "args": ["/path/to/renpho-mcp-server/dist/index.js"],
      "env": {
        "RENPHO_EMAIL": "your-email@example.com",
        "RENPHO_PASSWORD": "your-password"
      }
    }
  }
}
```

## Available Tools

| Tool                     | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `get_latest_measurement` | Most recent body composition reading selected for the current user |
| `get_body_composition`   | Detailed composition with health classifications                   |
| `get_weight_trend`       | Weight change analysis over N days                                 |
| `get_measurements`       | Historical measurements with date filtering                        |
| `get_current_user`       | User profile information                                           |
| `get_scale_users`        | Linked scale-user IDs and Renpho table mappings                    |
| `get_sync_diagnostics`   | Debug hidden/delayed measurements across linked scale users        |
| `refresh_data`           | Clear caches and force a fresh Renpho session                      |
| `health_check`           | Verify API connection status                                       |

## Example Usage

Once configured, ask Claude:

- "What's my current weight and body composition?"
- "Show my weight trend over the last 90 days"
- "How has my body fat percentage changed this year?"
- "Get my last 10 measurements"
- "Show my Renpho scale user IDs"
- "Run sync diagnostics for the last 7 days"
- "Refresh Renpho data and re-check my latest measurement"

## Technical Notes

- Uses the Renpho Health API (`cloud.renpho.com`), not the legacy API
- Implements AES-128-ECB encryption for API communication
- Handles JavaScript BigInt precision for large user IDs
- Scans all discovered Renpho scale tables and scale-user IDs before selecting measurements for the current user
- Includes a sync diagnostics tool to surface measurements associated with linked scale users but not currently selected for the logged-in user
- Caches authentication tokens (50 min) and measurements (5 min) to reduce API calls

### MorphoScan compatibility limits

Both classic and body-composition endpoints are queried for each discovered scale table. An empty advanced array preserves classic-only history. An unsupported/non-success response, authentication or network failure, malformed JSON, or unexpected advanced response shape fails the request explicitly; partial classic results are not cached as a successful combined history. No provider-specific unsupported-response codes are assumed.

Duplicate enrichment requires matching ID, timestamp, and weight plus nonempty, matching user and scale-user bindings on every record. Missing or empty bindings prohibit enrichment: those records remain independent and cannot inherit ownership or advanced metrics from another record.

Advanced history is scanned independently of classic counts, up to 1,000 records. An exact 1,000-record history requires an additional empty-page probe; more records fail with an incomplete-history error rather than claiming a safe latest measurement. Numerical advanced fields retain API names without inferred units. Current-user fallback accepts unbound records on the selected scale, never records explicitly bound to another user.

Coverage uses synthetic encrypted responses with mocked fetch, not live provider/account validation. Actual endpoint availability across account types and devices remains unverified.

### Classic current-user pagination

Current-user queries count selected, deduplicated classic records toward the requested limit, rather than stopping after that many associated users' records. Classic pages are read newest first in 200-record pages. Unbound fallback is selected only after direct current-user records have been ruled out within the requested date range.

The scan retains at most 1,000 classic records per table. If selection is still unresolved, it fails explicitly without caching partial results. A whole page that would exceed this budget is rejected, even if some records on it would fit; a short newest page can therefore require one additional page request before rejection. A separate six-page-request ceiling bounds network work even if the provider returns unexpectedly short pages. Reaching page 1 establishes table exhaustion, including an exactly 1,000-record history. An unexpectedly empty inferred page above page 1 fails explicitly.

This retains the existing classic API assumptions: chronological pages and accurate `device/count` metadata. Counts remain cached with the authentication session, so stale counts or provider ordering changes are not resolved by this pagination fix. Use `refresh_data` to refresh cached account state. Different requested limits use separate measurement-cache entries; repeated identical queries reuse their entry. Advanced-history scanning, explicit scale-user queries, and sync-diagnostic limits are unchanged.

### Local verification

`pnpm test` recursively discovers all `.test.ts` files under `test/` without relying on shell or Node-version-specific glob expansion. `pnpm lint` checks the recursive source tree with ESLint's recommended correctness rules, the TypeScript compatibility preset, and additional TypeScript correctness checks. TypeScript checks remain the responsibility of `pnpm exec tsc --noEmit`; lint does not introduce a style or provider-response typing migration.

## Known Wi-Fi Scale Sync Caveat

Some Wi-Fi scales appear to upload measurements that are not immediately bound to the expected Renpho user until the mobile app performs additional sync logic. This server now helps debug that state with `get_scale_users`, `get_sync_diagnostics`, and `refresh_data`, but the exact server-side binding call used by the app is still being investigated.

## Privacy

- Credentials are only used to authenticate with Renpho's API
- No data is stored permanently or sent to third parties
- All communication uses HTTPS

## Credits

API reverse engineering based on [RenphoGarminSync-CLI](https://github.com/forkerer/RenphoGarminSync-CLI) by forkerer.

MorphoScan eight-electrode support and its pagination/identity regression coverage were contributed by [rubenfsantiago](https://github.com/rubenfsantiago) in [#13](https://github.com/StartupBros-com/renpho-mcp-server/pull/13).

## License

MIT
