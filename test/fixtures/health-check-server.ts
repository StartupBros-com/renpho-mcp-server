import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";

const trace = process.env.RENPHO_TEST_TRACE;
const mode = process.env.RENPHO_TEST_MODE;
assert.ok(trace && mode, "health-check fixture must be launched by the test");

const LOGIN = "renpho-aggregation/user/login";
const DEVICES = "renpho-aggregation/device/count";
// Fixed encrypted responses for a fabricated fixture-only login and empty scale list.
// No provider traffic was captured, and the fixture never falls back to real fetch.
const LOGIN_DATA = "q56ZHRSCcQXhYHfMjBlg7jR0wJ1FB9J22uO8nKxFhUF6OVzeWNg1z+AWpqsiTEnrV/vxEB+Ce9T98LGZfy7HhPK1Nu4KcEt3oQhyHoUxuVdm0OT/XpCKTZRoSXPZnOYS";
const DEVICES_DATA = "KS0H2nkdGW9FTiZsE6fEVA==";
let calls = 0;
globalThis.fetch = async (input) => {
  const path = new URL(String(input)).pathname.slice(1);
  appendFileSync(trace, path + "\n");
  calls += 1;
  if (calls === 1 && path === LOGIN) {
    if (mode === "network") throw new Error("disconnected fixture");
    if (mode === "auth") return Response.json({ code: 104 });
    return Response.json({ code: 101, data: LOGIN_DATA });
  }
  if (calls === 2 && path === DEVICES && mode === "success") {
    return Response.json({ code: 101, data: DEVICES_DATA });
  }
  throw new Error("Unexpected HTTP request in Renpho health-check fixture");
};

await import("../../src/index.js");
