import test from "node:test";
import assert from "node:assert/strict";
import { RenphoApiService } from "../src/services/renpho-api.js";

// Synthetic pages only: an accidental provider call is a local failure.
globalThis.fetch = async () => {
  throw new Error("Real fetch forbidden in offline tests");
};

function history(count: number, descending: boolean) {
  const service = new RenphoApiService(
    "offline@example.invalid",
    "offline",
  ) as any;
  const now = Math.floor(Date.now() / 1000);
  const rows = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    timeStamp: now - i,
    weight: 72,
    bUserId: i === count - 1 ? "current" : "foreign",
    subUserId: "scale",
    internalModel: "synthetic",
    smmMass: 31,
  }));
  if (!descending) rows.reverse();
  service.authenticate = async () => ({
    userId: "current",
    scaleUserIds: ["scale"],
    scaleTables: [{ table_name: "table", user_ids: ["scale"], count: 0 }],
    user: { id: "current" },
    expires_at: Date.now() + 60000,
  });
  const budgets: number[] = [];
  service.fetchMeasurementsForTable = async (
    _session: unknown,
    _table: unknown,
    _ids: unknown,
    limit: number,
  ) => {
    budgets.push(limit);
    return [];
  };
  service.getFamilyMembers = async () => [];
  const pages: number[] = [];
  service.postEncryptedRaw = async (
    _path: string,
    _session: unknown,
    body: any,
  ) => {
    const page = Number(body.pageNum);
    pages.push(page);
    return JSON.stringify(rows.slice((page - 1) * 100, page * 100));
  };
  return { service, pages, budgets, now };
}

for (const descending of [false, true]) {
  test(`current selection precedes cap despite 250 newer foreign records, descending=${descending}`, async () => {
    const { service, budgets } = history(251, descending);
    const latest = await service.getLatestMeasurement();
    assert.equal(latest.id, "250");
    assert.equal(latest.user_id, "current");
    assert.deepEqual(budgets, [1]);
    const cached = [...service.measurementCache.values()] as any[][];
    assert.equal(cached.length, 1);
    assert.deepEqual(
      cached[0].map((row) => row.id),
      ["250"],
    );
  });

  for (const count of [251, 1000]) {
    test(`diagnostics and associated cache stay bounded after ${count} scanned rows, descending=${descending}`, async (t) => {
      let clock = 1_735_732_800_000;
      t.mock.method(Date, "now", () => clock);
      const { service, pages, budgets, now } = history(count, descending);
      const diagnostics = await service.getSyncDiagnostics();
      assert.equal(diagnostics.measurement_devices[0].measurement_count, 50);
      assert.equal(diagnostics.latest_associated_measurement.id, "0");
      assert.equal(diagnostics.visible_latest_measurement, null);
      assert.equal(diagnostics.hidden_associated_measurements.length, 5);
      assert.deepEqual(
        pages,
        Array.from({ length: count === 1000 ? 11 : 3 }, (_, i) => i + 1),
      );
      assert.deepEqual(budgets, [50]);
      const cached = [...service.measurementCache.values()] as any[][];
      assert.equal(cached.length, 1);
      assert.equal(cached[0].length, 50);
      assert.equal(cached[0][49].time_stamp, now - 49);
      const pageCount = pages.length;
      await service.getSyncDiagnostics();
      assert.equal(pages.length, pageCount);
      // Advancing the relative date cutoff is a distinct query, not a cache hit.
      clock += 1000;
      await service.getSyncDiagnostics();
      assert.equal(pages.length, pageCount * 2);
      // Diagnostic caching must not hide an older current-user row from latest.
      assert.equal(
        (await service.getLatestMeasurement()).id,
        String(count - 1),
      );
      assert.ok(
        [...service.measurementCache.values()].every(
          (value: any) => value.length <= 200,
        ),
      );
    });
  }

  test(`associated cache separates selection modes and applies date before cap, descending=${descending}`, async () => {
    const { service, pages, now } = history(251, descending);
    const current = await service.getAssociatedMeasurements(
      undefined,
      50,
      true,
    );
    assert.deepEqual(
      current.map((row: any) => row.id),
      ["250"],
    );
    const all = await service.getAssociatedMeasurements(undefined, 50);
    assert.equal(all.length, 50);
    assert.equal(all[0].id, "0");
    const calls = pages.length;
    assert.deepEqual(
      await service.getAssociatedMeasurements(undefined, 50, true),
      current,
    );
    assert.deepEqual(
      await service.getAssociatedMeasurements(undefined, 50),
      all,
    );
    assert.equal(pages.length, calls);
    const recent = await service.getAssociatedMeasurements(now - 9, 50);
    assert.equal(recent.length, 10);
    assert.equal(recent[9].id, "9");
    assert.deepEqual(
      await service.getAssociatedMeasurements(now - 9, 50, true),
      [],
    );
  });
}
