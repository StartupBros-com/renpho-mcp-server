import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LOGIN = "renpho-aggregation/user/login";
const DEVICES = "renpho-aggregation/device/count";

async function connect(t: TestContext, mode: "success" | "auth" | "network") {
  const cwd = mkdtempSync(join(tmpdir(), "renpho-health-"));
  const trace = join(cwd, "requests.txt");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      import.meta.resolve("tsx"),
      fileURLToPath(new URL("../fixtures/health-check-server.ts", import.meta.url)),
    ],
    cwd,
    env: {
      RENPHO_EMAIL: "fixture@example.invalid",
      RENPHO_PASSWORD: "fixture-password",
      DOTENV_CONFIG_QUIET: "true",
      RENPHO_TEST_TRACE: trace,
      RENPHO_TEST_MODE: mode,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "renpho-health-test", version: "1" });
  t.after(async () => {
    try {
      await client.close();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  await client.connect(transport);
  return {
    async health() {
      const result = await client.callTool({ name: "health_check" });
      assert.equal(result.isError, undefined);
      assert.ok(Array.isArray(result.content));
      assert.equal(result.content.length, 1);
      const [item] = result.content;
      assert.equal(item.type, "text");
      assert.match(item.text, /^Renpho MCP Server Health Check$/m);
      assert.match(item.text, /^Timestamp: \d{4}-\d\d-\d\dT\S+Z$/m);
      return item.text;
    },
    descriptor: async () => (await client.listTools()).tools.find(tool => tool.name === "health_check"),
    requests: () => readFileSync(trace, "utf8").trim().split("\n"),
  };
}

test("health_check qualifies cold and cached auth without probing a warm session", { timeout: 10_000 }, async (t) => {
  const fixture = await connect(t, "success");
  const cold = await fixture.health();
  assert.deepEqual(fixture.requests(), [LOGIN, DEVICES]);
  const warm = await fixture.health();
  assert.deepEqual(fixture.requests(), [LOGIN, DEVICES]);

  for (const output of [cold, warm]) {
    assert.match(output, /^Status: Healthy$/m);
    assert.match(output, /^API Connection: Not independently verified \(authenticated session available; may be cached\)$/m);
    assert.match(output, /^User: fixture@example\.invalid$/m);
    assert.match(output, /^Version: \d+\.\d+\.\d+$/m);
  }
  const descriptor = await fixture.descriptor();
  assert.match(descriptor?.description ?? "", /authenticated Renpho session availability without independently verifying live API reachability/);
  assert.deepEqual(fixture.requests(), [LOGIN, DEVICES]);
});

for (const [mode, error] of [
  ["auth", "Authentication failed: code=104"],
  ["network", "Network error calling renpho-aggregation/user/login"],
] as const) {
  test(`health_check describes a failed ${mode} session check without diagnosing live reachability`, { timeout: 10_000 }, async (t) => {
    const fixture = await connect(t, mode);
    const text = await fixture.health();
    assert.deepEqual(fixture.requests(), [LOGIN]);
    assert.match(text, /^Status: Unhealthy$/m);
    assert.match(text, /^API Connection: Not verified \(session check failed\)$/m);
    assert.ok(text.split("\n").includes(`Error: ${error}`));
  });
}
