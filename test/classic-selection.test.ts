import test from "node:test";
import assert from "node:assert/strict";
import { RenphoApiService } from "../src/services/renpho-api.js";

globalThis.fetch = async () => {
  throw new Error("Real fetch forbidden in offline tests");
};

function history(count: number, current: number[], unbound = false) {
  const service = new RenphoApiService(
    "offline@example.invalid",
    "offline",
  ) as any;
  const now = Math.floor(Date.now() / 1000);
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    timeStamp: now - count + i,
    weight: 72,
    bUserId: current.includes(i) ? "current" : unbound ? undefined : "foreign",
    subUserId: "scale",
  }));
  service.authenticate = async () => ({
    userId: "current",
    scaleUserIds: ["scale"],
    scaleTables: [{ table_name: "table", user_ids: ["scale"], count }],
    user: { id: "current" },
    expires_at: Date.now() + 60000,
  });
  const pages: number[] = [];
  service.postEncryptedRaw = async (
    path: string,
    _session: unknown,
    body: any,
  ) => {
    if (path.endsWith("queryBodyCompositionMeasureData")) return "[]";
    assert.ok(path.endsWith("queryAllMeasureDataList"));
    pages.push(Number(body.pageNum));
    return JSON.stringify(
      rows.slice(
        (body.pageNum - 1) * body.pageSize,
        body.pageNum * body.pageSize,
      ),
    );
  };
  return { service, rows, pages, now };
}

test("latest finds a classic current-user row behind 250 foreign rows", async () => {
  const { service, pages } = history(251, [0]);
  assert.equal((await service.getLatestMeasurement())?.id, "0");
  assert.deepEqual(pages, [2, 1]);
  await service.getLatestMeasurement();
  assert.deepEqual(pages, [2, 1]);
});

test("recent history does not spend its result limit on foreign classic rows", async () => {
  const { service, now, pages } = history(451, [0]);
  const result = await service.getMeasurements(undefined, now - 86400, 100);
  assert.deepEqual(
    result.map((row: any) => row.id),
    ["0"],
  );
  assert.deepEqual(pages, [3, 2, 1]);
});

test("a partial final classic page does not underfill the requested limit", async () => {
  const { service } = history(201, [199, 200]);
  assert.deepEqual(
    (await service.getMeasurements(undefined, undefined, 2)).map(
      (row: any) => row.id,
    ),
    ["200", "199"],
  );
});

test("latest stops at the requested current-user limit in a large history", async () => {
  const { service, pages } = history(2000, [1999]);
  assert.equal((await service.getLatestMeasurement())?.id, "1999");
  assert.deepEqual(pages, [10]);
});

test("a date cutoff excludes an older current-user classic row", async () => {
  const { service, now } = history(451, [0]);
  assert.deepEqual(
    await service.getMeasurements(undefined, now - 100, 100),
    [],
  );
});

test("unbound fallback cannot outrank an older explicitly current-user row", async () => {
  const { service } = history(451, [0], true);
  assert.equal((await service.getLatestMeasurement())?.id, "0");
});

test("an exactly 1000-row unbound classic history retains fallback", async () => {
  const { service, pages } = history(1000, [], true);
  assert.equal((await service.getLatestMeasurement())?.id, "999");
  assert.deepEqual(pages, [5, 4, 3, 2, 1]);
});

test("unresolved classic selection at the scan bound fails without caching", async () => {
  const { service, pages } = history(1200, [0]);
  await assert.rejects(
    () => service.getLatestMeasurement(),
    /Incomplete classic history/,
  );
  assert.equal(service.measurementCache.size, 0);
  assert.deepEqual(pages, [6, 5, 4, 3, 2]);
});

test("foreign-only complete history does not become fallback", async () => {
  const { service } = history(451, []);
  assert.equal(await service.getLatestMeasurement(), null);
});

test("duplicates cannot spend the selected classic result limit", async () => {
  const { service, rows, now, pages } = history(401, [
    0,
    ...Array.from({ length: 201 }, (_, i) => i + 200),
  ]);
  for (const row of rows.slice(200)) {
    row.id = "duplicate";
    row.timeStamp = now;
  }
  assert.deepEqual(
    (await service.getMeasurements(undefined, undefined, 2)).map(
      (row: any) => row.id,
    ),
    ["duplicate", "0"],
  );
  assert.deepEqual(pages, [3, 2, 1]);
});

test("out-of-range directly bound rows do not suppress in-range fallback", async () => {
  const { service, now } = history(451, [0], true);
  assert.equal(
    (await service.getMeasurements(undefined, now - 100, 1))[0].id,
    "450",
  );
});

test("missing timestamps do not manufacture a classic date boundary", async () => {
  const { service, rows, now, pages } = history(401, [0]);
  for (const row of rows.slice(200, 400)) delete (row as any).timeStamp;
  assert.equal(
    (await service.getMeasurements(undefined, now - 86400, 1))[0].id,
    "0",
  );
  assert.deepEqual(pages, [3, 2, 1]);
});

test("a partial newest page cannot expand the whole-page scan budget", async () => {
  const { service, pages } = history(1001, [1]);
  await assert.rejects(
    () => service.getLatestMeasurement(),
    /Incomplete classic history/,
  );
  assert.equal(service.measurementCache.size, 0);
  assert.deepEqual(pages, [6, 5, 4, 3, 2, 1]);
});

test("an empty inferred newest page does not claim empty current history", async () => {
  const { service, rows } = history(401, [0]);
  rows.splice(400);
  await assert.rejects(
    () => service.getLatestMeasurement(),
    /Incomplete classic history/,
  );
  assert.equal(service.measurementCache.size, 0);
});

test("unexpectedly short classic pages cannot exceed the request budget", async () => {
  const { service } = history(100000, []);
  let requests = 0;
  service.postEncryptedRaw = async (path: string) => {
    if (path.endsWith("queryBodyCompositionMeasureData")) return "[]";
    requests++;
    return '[{"id":"foreign","timeStamp":100,"weight":72,"bUserId":"foreign","subUserId":"scale"}]';
  };
  await assert.rejects(
    () => service.getLatestMeasurement(),
    /Incomplete classic history/,
  );
  assert.equal(requests, 6);
  assert.equal(service.measurementCache.size, 0);
});

for (const timestamp of [" ", false, null, "bad", ""]) {
  test(`invalid timestamp ${JSON.stringify(timestamp)} cannot establish a date cutoff`, async () => {
    const { service, rows, now, pages } = history(201, [0]);
    (rows[200] as any).timeStamp = timestamp;
    assert.equal(
      (await service.getMeasurements(undefined, now - 86400, 1))[0].id,
      "0",
    );
    assert.deepEqual(pages, [2, 1]);
  });
}
