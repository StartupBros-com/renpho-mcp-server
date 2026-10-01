import test from 'node:test';
import assert from 'node:assert/strict';
import { RenphoApiService } from '../src/services/renpho-api.js';
import type { RenphoMeasurement } from '../src/types/renpho.js';

function createService() {
  return new RenphoApiService('test@example.com', 'password');
}

function createSession() {
  return {
    token: 'token',
    userId: 'user-1',
    scaleUserIds: ['scale-1', 'scale-2'],
    scaleTables: [
      { table_name: 'table_a', user_ids: ['scale-1'], count: 120 },
      { table_name: 'table_b', user_ids: ['scale-2'], count: 120 }
    ],
    user: {
      id: 'user-1',
      email: 'test@example.com'
    },
    expires_at: Date.now() + 60_000
  };
}

function measurement(overrides: Partial<RenphoMeasurement>): RenphoMeasurement {
  return {
    id: 'm-1',
    time_stamp: 1,
    weight: 80,
    ...overrides
  };
}

test('getScaleUsers returns every discovered scale user across tables', async () => {
  const service = createService() as any;
  service.authenticate = async () => createSession();

  const scaleUsers = await service.getScaleUsers();

  assert.equal(scaleUsers.length, 2);
  assert.deepEqual(
    scaleUsers.map((entry: any) => ({ user_id: entry.user_id, table_name: entry.table_name })),
    [
      { user_id: 'scale-1', table_name: 'table_a' },
      { user_id: 'scale-2', table_name: 'table_b' }
    ]
  );
});

test('getMeasurements prefers measurements already bound to the logged in user', async () => {
  const service = createService() as any;
  const session = createSession();
  service.authenticate = async () => session;
  service.getAssociatedMeasurements = async () => [
    measurement({
      id: 'hidden-newer',
      time_stamp: 200,
      scale_user_id: 'scale-2',
      user_id: 'other-user'
    }),
    measurement({
      id: 'visible-current-user',
      time_stamp: 150,
      scale_user_id: 'scale-1',
      user_id: 'user-1'
    })
  ];

  const measurements = await service.getMeasurements(undefined, undefined, 10);

  assert.equal(measurements.length, 1);
  assert.equal(measurements[0].id, 'visible-current-user');
});

test('getMeasurements falls back to the only scale user when measurements are not yet bound', async () => {
  const service = createService() as any;
  const session = {
    ...createSession(),
    scaleUserIds: ['scale-1'],
    scaleTables: [{ table_name: 'table_a', user_ids: ['scale-1'], count: 2 }]
  };
  service.authenticate = async () => session;
  service.getAssociatedMeasurements = async () => [
    measurement({ id: 'pending-bind', time_stamp: 300, scale_user_id: 'scale-1' })
  ];

  const measurements = await service.getMeasurements(undefined, undefined, 10);

  assert.equal(measurements.length, 1);
  assert.equal(measurements[0].id, 'pending-bind');
});

test('fetchMeasurementPage preserves big integer ids as strings', async () => {
  const service = createService() as any;
  service.postEncryptedRaw = async () => '[{"id":5919278420902642176,"timeStamp":1771059525,"bUserId":5245536005636456320,"subUserId":5245536005636456320,"weight":88.15}]';

  const page = await service.fetchMeasurementPage(createSession(), 'table_a', ['scale-1'], 1, 50);
  const mapped = service.mapMeasurement(page[0]);

  assert.equal(mapped.id, '5919278420902642176');
  assert.equal(mapped.user_id, '5245536005636456320');
  assert.equal(mapped.scale_user_id, '5245536005636456320');
});

test('fetchMeasurementsForTable pulls newest pages first when filtering recent timestamps', async () => {
  const service = createService() as any;
  const pagesVisited: number[] = [];
  service.fetchMeasurementPage = async (
    _session: unknown,
    _tableName: string,
    _userIds: string[],
    pageNum: number
  ) => {
    pagesVisited.push(pageNum);

    if (pageNum === 3) {
      return [
        { id: 3, timeStamp: 300, weight: 80 },
        { id: 4, timeStamp: 250, weight: 79 }
      ];
    }

    if (pageNum === 2) {
      return [
        { id: 2, timeStamp: 150, weight: 78 },
        { id: 5, timeStamp: 120, weight: 77 }
      ];
    }

    return [
      { id: 1, timeStamp: 90, weight: 76 }
    ];
  };

  const results = await service.fetchMeasurementsForTable(
    createSession(),
    { table_name: 'table_a', user_ids: ['scale-1'], count: 120 },
    ['scale-1'],
    2,
    200
  );

  assert.deepEqual(pagesVisited, [3]);
  assert.deepEqual(results.map((entry: any) => entry.id), [3, 4]);
});

test('summarizeDeviceCategories reports every raw category with handled/data flags', async () => {
  const { summarizeDeviceCategories } = await import('../src/services/renpho-api.js');

  const categories = summarizeDeviceCategories({
    scale: [
      { userIds: [1], count: 387, tableName: 'measurements_info_16' },
      { userIds: [2], count: 12, tableName: 'measurements_info_19' }
    ],
    girth: 0,
    stepCount: 4,
    treadmill: { total: 0, hasMileageUnitSet: false },
    bodyScan: [{ userIds: [3], count: 9, tableName: 'morpho_measurements_2' }]
  });

  const byName = new Map(categories.map(category => [category.category, category]));

  assert.equal(categories.length, 5);
  assert.deepEqual(
    { handled: byName.get('scale')?.handled, has_data: byName.get('scale')?.has_data },
    { handled: true, has_data: true }
  );
  assert.ok(byName.get('scale')?.detail.includes('measurements_info_16 (387 records)'));
  assert.deepEqual(
    { handled: byName.get('girth')?.handled, has_data: byName.get('girth')?.has_data },
    { handled: false, has_data: false }
  );
  assert.equal(byName.get('stepCount')?.has_data, true);
  assert.equal(byName.get('treadmill')?.has_data, false);
  assert.deepEqual(
    { handled: byName.get('bodyScan')?.handled, has_data: byName.get('bodyScan')?.has_data },
    { handled: false, has_data: true }
  );
  assert.ok(byName.get('bodyScan')?.detail.includes('morpho_measurements_2 (9 records)'));
});

test('aggregateMeasurementDevices groups by device identity with counts and latest timestamp', async () => {
  const { aggregateMeasurementDevices } = await import('../src/services/renpho-api.js');

  const devices = aggregateMeasurementDevices([
    measurement({ id: 'a', time_stamp: 100, internal_model: 'ES-26M', scale_name: 'Old Scale' }),
    measurement({ id: 'b', time_stamp: 300, internal_model: 'ES-26M', scale_name: 'Old Scale' }),
    measurement({ id: 'c', time_stamp: 200, internal_model: 'MORPHO-1', scale_name: 'MorphoScan' })
  ]);

  assert.deepEqual(
    devices.map(device => ({
      internal_model: device.internal_model,
      measurement_count: device.measurement_count,
      latest_time_stamp: device.latest_time_stamp
    })),
    [
      { internal_model: 'ES-26M', measurement_count: 2, latest_time_stamp: 300 },
      { internal_model: 'MORPHO-1', measurement_count: 1, latest_time_stamp: 200 }
    ]
  );
});

test('getSyncDiagnostics surfaces device categories and measurement devices', async () => {
  const service = createService() as any;
  const session = {
    ...createSession(),
    deviceCategories: [
      { category: 'scale', handled: true, has_data: true, detail: '2 entries' },
      { category: 'bodyScan', handled: false, has_data: true, detail: '1 entries' },
      { category: 'girth', handled: false, has_data: false, detail: '0' }
    ]
  };
  service.authenticate = async () => session;
  service.getFamilyMembers = async () => [];
  service.getAssociatedMeasurements = async () => [
    measurement({ id: 'a', time_stamp: 100, user_id: 'user-1', scale_user_id: 'scale-1', internal_model: 'ES-26M' })
  ];

  const diagnostics = await service.getSyncDiagnostics(7);

  assert.equal(diagnostics.device_categories.length, 3);
  assert.deepEqual(
    diagnostics.unhandled_device_categories_with_data.map((category: any) => category.category),
    ['bodyScan']
  );
  assert.deepEqual(
    diagnostics.measurement_devices.map((device: any) => device.internal_model),
    ['ES-26M']
  );
});

test('getMeasurements fails with a diagnostics pointer when no scale tables exist', async () => {
  const service = createService() as any;
  service.authenticate = async () => ({
    ...createSession(),
    scaleTables: [],
    scaleUserIds: []
  });

  await assert.rejects(
    () => service.getMeasurements(undefined, undefined, 10),
    /No scale devices found.*get_sync_diagnostics/
  );
});

test("lossless JSON preserves sparse, nested and whitespace-separated IDs", async () => {
  const { parseRenphoJson, serializeRenphoRequest } =
    await import("../src/services/renpho-api.js");
  const rows = parseRenphoJson<any[]>(
    '[{"id": 9223372036854775806,"weight":73.25},{"id":"42","subUserId": 9223372036854775806,"nested":{"id": 5919278420902642176}}]',
  );
  assert.equal(rows[0].id, "9223372036854775806");
  assert.equal(rows[1].subUserId, "9223372036854775806");
  assert.equal(rows[1].nested.id, "5919278420902642176");
  assert.equal(rows[0].weight, 73.25);
  assert.equal(
    serializeRenphoRequest({
      userIds: ["9223372036854775806"],
      pageSize: "100",
    }),
    '{"userIds":[9223372036854775806],"pageSize":"100"}',
  );
  assert.throws(
    () => serializeRenphoRequest({ userIds: [9223372036854775806] }),
    /exact decimal/,
  );
});

test("MorphoScan pages independently of classic counts and preserves advanced fields", async () => {
  const service = createService() as any;
  const calls: any[] = [];
  service.postEncryptedRaw = async (
    path: string,
    _session: unknown,
    body: any,
  ) => {
    calls.push({ path, body });
    if (body.pageNum === "1")
      return JSON.stringify(
        Array.from({ length: 100 }, (_, i) => ({
          id: String(i),
          timeStamp: i,
          weight: 80,
        })),
      );
    return '[{"id":9223372036854775806,"bUserId":9223372036854775806,"timeStamp":200,"weight":73.25,"deviceType":"00053","smmMass":35,"z20HandL":123}]';
  };
  const rows = await service.fetchBodyCompositionMeasurements(
    createSession(),
    { table_name: "measurements_info_19", count: 0 },
    ["9223372036854775806"],
  );
  assert.equal(rows.length, 101);
  assert.deepEqual(calls[0], {
    path: "RenphoHealth/scale/queryBodyCompositionMeasureData",
    body: {
      userIds: ["9223372036854775806"],
      pageSize: "100",
      tableName: "measurements_info_19",
      pageNum: "1",
    },
  });
  assert.equal(calls[1].body.pageNum, "2");
  const m = service.mapMeasurement(rows[100]);
  assert.equal(m.id, "9223372036854775806");
  assert.equal(m.user_id, "9223372036854775806");
  assert.equal(m.device_type, "00053");
  assert.equal(m.body_composition.z20HandL, 123);
  assert.equal(m.measurement_source, "eightElectrodeWeight");
});

test("combined history keeps richer duplicate and sorts across both devices", async () => {
  const service = createService() as any;
  const session = createSession();
  service.authenticate = async () => session;
  service.fetchMeasurementsForTable = async () => [
    { id: "duplicate", timeStamp: 200, weight: 85 },
    { id: "classic", timeStamp: 300, weight: 84 },
  ];
  service.fetchBodyCompositionMeasurements = async () => [
    {
      id: "duplicate",
      timeStamp: 200,
      weight: 85,
      smmMass: 35,
      __measurementSource: "eightElectrodeWeight",
    },
    {
      id: "morpho",
      timeStamp: 400,
      weight: 83,
      __measurementSource: "eightElectrodeWeight",
    },
  ];
  const rows = await service.getMeasurements("scale-1", 250, 10);
  assert.deepEqual(
    rows.map((m: any) => m.id),
    ["morpho", "classic"],
  );
  const all = await service.getMeasurements("scale-1", undefined, 10);
  assert.equal(
    all.find((m: any) => m.id === "duplicate").body_composition.smmMass,
    35,
  );
});

test("latest chooses newest current-user measurement across both histories", async () => {
  const service = createService() as any;
  service.authenticate = async () => createSession();
  service.fetchMeasurementsForTable = async () => [
    { id: "classic", timeStamp: 100, weight: 80, bUserId: "user-1" },
  ];
  service.fetchBodyCompositionMeasurements = async () => [
    {
      id: "morpho",
      timeStamp: 200,
      weight: 79,
      bUserId: "user-1",
      __measurementSource: "eightElectrodeWeight",
    },
  ];
  const latest = await service.getLatestMeasurement();
  assert.equal(latest.id, "morpho");
  assert.equal(latest.measurement_source, "eightElectrodeWeight");
});

test("unexpected MorphoScan response fails explicitly", async () => {
  const service = createService() as any;
  service.postEncryptedRaw = async () => '{"list":[]}';
  await assert.rejects(
    () =>
      service.fetchBodyCompositionMeasurements(
        createSession(),
        { table_name: "table_a" },
        ["1"],
      ),
    /expected array/,
  );
});


test('advanced output excludes auth, synchronization, and demographic fields', async () => {
  const service = createService() as any;
  const { formatMeasurement } = await import('../src/utils/formatting.js');
  const mapped = service.mapMeasurement({id:'1',timeStamp:1,weight:85,__measurementSource:'eightElectrodeWeight', deviceType:'00053', smmMass:35, z20Body:123, fitBitAuth:'do-not-output', birthday:'private', reportId:'private', appleHealthAuth:'private'});
  assert.deepEqual(mapped.body_composition, {smmMass:35,z20Body:123});
  const formatted = formatMeasurement(mapped);
  assert.ok(formatted.includes('smmMass: 35'));
  assert.ok(formatted.includes('eightElectrodeWeight'));
  assert.ok(!formatted.includes('do-not-output'));
  assert.ok(!formatted.includes('private'));
});
