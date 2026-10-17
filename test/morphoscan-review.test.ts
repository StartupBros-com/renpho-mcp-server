import test from "node:test";
import assert from "node:assert/strict";
import { RenphoApiService } from "../src/services/renpho-api.js";

// Every test uses synthetic fixtures and mocked transport. Any accidental
// provider request must fail locally rather than authenticating or fetching.
globalThis.fetch = async () => {
  throw new Error("Real fetch forbidden in offline tests");
};

function serviceWithTables(reverse = false) {
  const service = new RenphoApiService(
    "offline@example.invalid",
    "offline",
  ) as any;
  const tables = [
    { table_name: "classic_table", user_ids: ["2"], count: 1 },
    { table_name: "advanced_table", user_ids: ["2"], count: 1 },
  ];
  service.authenticate = async () => ({
    userId: "1",
    scaleUserIds: ["2"],
    scaleTables: reverse ? tables.reverse() : tables,
    user: { id: "1", email: "offline@example.invalid" },
    expires_at: Date.now() + 60000,
  });
  service.fetchMeasurementsForTable = async (_session: unknown, table: any) =>
    table.table_name === "classic_table"
      ? [
          {
            id: "same",
            timeStamp: 200,
            weight: 72,
            bUserId: "1",
            subUserId: "2",
            bmi: 24,
          },
        ]
      : [];
  service.fetchBodyCompositionMeasurements = async (
    _session: unknown,
    table: any,
  ) =>
    table.table_name === "advanced_table"
      ? [
          {
            id: "same",
            timeStamp: 200,
            weight: 72,
            bUserId: "1",
            subUserId: "2",
            smmMass: 31,
            __measurementSource: "eightElectrodeWeight",
          },
        ]
      : [];
  return service;
}

for (const reverse of [false, true]) {
  test(`cross-table duplicates retain advanced metrics, reverse=${reverse}`, async () => {
    const service = serviceWithTables(reverse);
    const rows = await service.getMeasurements(undefined, undefined, 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].body_composition.smmMass, 31);
    assert.equal(rows[0].measurement_source, "eightElectrodeWeight");
    assert.equal(rows[0].bmi, 24);
    const latest = await service.getLatestMeasurement();
    assert.equal(latest.body_composition.smmMass, 31);
    assert.equal(latest.user_id, "1");
  });

  test(`sparse advanced duplicate cannot inherit classic bindings, reverse=${reverse}`, async () => {
    const service = serviceWithTables(reverse);
    service.fetchBodyCompositionMeasurements = async (
      _session: unknown,
      table: any,
    ) =>
      table.table_name === "advanced_table"
        ? [
            {
              id: "same",
              timeStamp: 200,
              weight: 72,
              bUserId: null,
              subUserId: null,
              smmMass: 31,
              __measurementSource: "eightElectrodeWeight",
            },
          ]
        : [];
    const latest = await service.getLatestMeasurement();
    assert.ok(latest);
    assert.equal(latest.user_id, "1");
    assert.equal(latest.scale_user_id, "2");
    assert.equal(latest.bmi, 24);
    assert.equal(latest.body_composition, undefined);
    assert.equal(latest.measurement_source, "fourElectrodeWeight");
    const associated = await service.getAssociatedMeasurements(undefined, 10);
    assert.equal(associated.length, 2);
    const advanced = associated.find(
      (row: any) => row.measurement_source === "eightElectrodeWeight",
    );
    assert.equal(advanced.user_id, undefined);
    assert.equal(advanced.scale_user_id, undefined);
    assert.equal(advanced.body_composition.smmMass, 31);
  });
}

for (const descending of [false, true]) {
  for (const count of [999, 1000, 1001]) {
    test(`scan completeness for ${count} records, descending=${descending}`, async () => {
      const service = serviceWithTables();
      service.fetchBodyCompositionMeasurements = (
        RenphoApiService.prototype as any
      ).fetchBodyCompositionMeasurements;
      // Private methods are deliberately exercised through the test-only any view.
      const calls: number[] = [];
      const data = Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        timeStamp: descending ? count - i : i + 1,
        weight: 72,
        bUserId: "1",
        subUserId: "2",
      }));
      service.authenticate = async () => ({
        userId: "1",
        scaleUserIds: ["2"],
        scaleTables: [
          { table_name: "advanced_table", user_ids: ["2"], count: 0 },
        ],
        user: { id: "1" },
        expires_at: Date.now() + 60000,
      });
      service.fetchMeasurementsForTable = async () => [];
      service.postEncryptedRaw = async (
        _path: string,
        _session: unknown,
        body: any,
      ) => {
        const page = Number(body.pageNum);
        calls.push(page);
        return JSON.stringify(data.slice((page - 1) * 100, page * 100));
      };
      if (count > 1000) {
        await assert.rejects(
          () => service.getLatestMeasurement(),
          /Incomplete body composition history/,
        );
        assert.equal(service.measurementCache.size, 0);
      } else {
        const latest = await service.getLatestMeasurement();
        assert.equal(latest.time_stamp, count);
      }
      assert.equal(calls.length, count === 999 ? 10 : 11);
    });
  }
}

test("conflicting user bindings are never merged or enriched with another user data", () => {
  const service = serviceWithTables();
  const rows = service.dedupeAndSortMeasurements([
    {
      id: "collision",
      time_stamp: 200,
      weight: 72,
      user_id: "1",
      measurement_source: "fourElectrodeWeight",
    },
    {
      id: "collision",
      time_stamp: 200,
      weight: 72,
      user_id: "other",
      body_composition: { smmMass: 99 },
      measurement_source: "eightElectrodeWeight",
    },
    {
      id: "collision",
      time_stamp: 200,
      weight: 72,
      body_composition: { smmMass: 31 },
      measurement_source: "eightElectrodeWeight",
    },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(
    rows.find((m: any) => m.user_id === "1").body_composition,
    undefined,
  );
});

test("same ID with different timestamp, weight or scale binding stays separate", () => {
  const service = serviceWithTables();
  const base = {
    id: "same",
    time_stamp: 200,
    weight: 72,
    user_id: "1",
    scale_user_id: "2",
  };
  for (const change of [
    { time_stamp: 201 },
    { weight: 73 },
    { scale_user_id: "3" },
  ]) {
    assert.equal(
      service.dedupeAndSortMeasurements([base, { ...base, ...change }]).length,
      2,
    );
  }
});

for (const reason of [
  "Authentication failed",
  "Network error",
  "Unexpected response",
]) {
  test(`new endpoint ${reason} remains an explicit failure`, async () => {
    const service = serviceWithTables();
    const error = new Error(reason);
    service.fetchBodyCompositionMeasurements = async () => {
      throw error;
    };
    await assert.rejects(
      () => service.getMeasurements(undefined, undefined, 10),
      (actual) => actual === error,
    );
    assert.equal(service.measurementCache.size, 0);
  });
}

test("empty advanced history retains valid classic history", async () => {
  const service = serviceWithTables();
  service.fetchBodyCompositionMeasurements = async () => [];
  const latest = await service.getLatestMeasurement();
  assert.equal(latest.id, "same");
  assert.equal(latest.measurement_source, "fourElectrodeWeight");
});
