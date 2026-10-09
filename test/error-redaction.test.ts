import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { RenphoApiService } from "../src/services/renpho-api.js";

const LOGIN = "renpho-aggregation/user/login";
const DEVICES = "renpho-aggregation/device/count";
const FAMILY = "RenphoHealth/centerUser/queryFamilyMemberList";
const MEASUREMENTS = "RenphoHealth/scale/queryAllMeasureDataList";
const CANARY = "CANARY42";
const MALFORMED = `{"token":${CANARY}}`;
const USER_ID = "9007199254740993";
const MEASUREMENT_ID = "9007199254740995";
const VALID_LOGIN = `{"login":{"id":${USER_ID},"token":"fixture-token","email":"fixture@example.invalid"}}`;
const VALID_DEVICES = `{"scale":[{"userIds":[${USER_ID}],"count":1,"tableName":"fixture_table"}]}`;

function createService() {
  return new RenphoApiService("fixture@example.invalid", "fixture-password");
}

function encryptedResponse(service: RenphoApiService, raw: string): Response {
  // Use real encryption/decryption with synthetic data; only transport is mocked.
  const data = (service as any).encryptAES(raw);
  return Response.json({ code: 101, data });
}

function mockResponses(
  t: TestContext,
  responses: Array<{ path: string; response: Response }>,
) {
  let index = 0;
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: unknown) => {
    const expected = responses[index++];
    assert.ok(expected, "Unexpected API request");
    assert.equal(String(url), `https://cloud.renpho.com/${expected.path}`);
    return expected.response;
  });
  t.after(() => assert.equal(fetchMock.mock.callCount(), responses.length));
}

const parseCases = [
  {
    name: "login",
    path: LOGIN,
    prerequisites: [],
    invoke: (service: RenphoApiService) => service.getCurrentUser(),
  },
  {
    name: "device discovery",
    path: DEVICES,
    prerequisites: [{ path: LOGIN, raw: VALID_LOGIN }],
    invoke: (service: RenphoApiService) => service.getCurrentUser(),
  },
  {
    name: "family members",
    path: FAMILY,
    prerequisites: [
      { path: LOGIN, raw: VALID_LOGIN },
      { path: DEVICES, raw: VALID_DEVICES },
    ],
    invoke: (service: RenphoApiService) => service.getFamilyMembers(),
  },
  {
    name: "measurements",
    path: MEASUREMENTS,
    prerequisites: [
      { path: LOGIN, raw: VALID_LOGIN },
      { path: DEVICES, raw: VALID_DEVICES },
    ],
    invoke: (service: RenphoApiService) => service.getMeasurements(USER_ID),
  },
];

for (const parseCase of parseCases) {
  for (const layer of ["outer", "decrypted"] as const) {
    test(`${parseCase.name} rejects malformed ${layer} JSON without response data`, async (t) => {
      const service = createService();
      mockResponses(t, [
        ...parseCase.prerequisites.map(({ path, raw }) => ({
          path,
          response: encryptedResponse(service, raw),
        })),
        {
          path: parseCase.path,
          response:
            layer === "outer"
              ? new Response(MALFORMED, { status: 502 })
              : encryptedResponse(service, MALFORMED),
        },
      ]);

      await assert.rejects(
        () => parseCase.invoke(service),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error.message,
            layer === "outer"
              ? `Failed to parse API response from ${parseCase.path}, status: 502`
              : `Failed to parse decrypted API response from ${parseCase.path}`,
          );
          // Logs and tool responses can inspect the whole error, not just message.
          assert.doesNotMatch(inspect(error, { showHidden: true }), /CANARY42/);
          assert.equal(Object.hasOwn(error, "cause"), false);
          return true;
        },
      );
    });
  }
}

test("valid responses retain data, exact large IDs, and session reuse", async (t) => {
  const service = createService();
  mockResponses(t, [
    { path: LOGIN, response: encryptedResponse(service, VALID_LOGIN) },
    { path: DEVICES, response: encryptedResponse(service, VALID_DEVICES) },
    {
      path: FAMILY,
      response: encryptedResponse(
        service,
        '{"list":[{"id":"fixture-member","email":"member@example.invalid"}]}',
      ),
    },
    {
      path: MEASUREMENTS,
      response: encryptedResponse(
        service,
        `[{"id":${MEASUREMENT_ID},"timeStamp":100,"bUserId":${USER_ID},"subUserId":${USER_ID},"weight":70}]`,
      ),
    },
  ]);

  assert.equal((await service.getCurrentUser()).id, USER_ID);
  const scaleUsers = await service.getScaleUsers();
  assert.equal(scaleUsers[0].user_id, USER_ID);
  const family = await service.getFamilyMembers();
  assert.equal(family[0].id, "fixture-member");
  assert.equal(family[0].email, "member@example.invalid");
  const measurements = await service.getMeasurements(USER_ID);
  assert.equal(measurements.length, 1);
  assert.equal(measurements[0].id, MEASUREMENT_ID);
  assert.equal(measurements[0].user_id, USER_ID);
  assert.equal(measurements[0].scale_user_id, USER_ID);
  assert.equal(measurements[0].weight, 70);
  assert.equal(measurements[0].time_stamp, 100);
});

test("valid JSON API failures remain visible", async (t) => {
  const service = createService();
  mockResponses(t, [
    { path: LOGIN, response: encryptedResponse(service, VALID_LOGIN) },
    {
      path: DEVICES,
      response: Response.json({
        code: 500,
        msg: "fixture service unavailable",
      }),
    },
  ]);
  await assert.rejects(
    () => service.getCurrentUser(),
    /API call failed for renpho-aggregation\/device\/count: code=500/,
  );
});

test("valid JSON with missing encrypted data still fails", async (t) => {
  const service = createService();
  mockResponses(t, [
    { path: LOGIN, response: encryptedResponse(service, VALID_LOGIN) },
    { path: DEVICES, response: Response.json({ code: 101 }) },
  ]);
  await assert.rejects(
    () => service.getCurrentUser(),
    /API call failed for renpho-aggregation\/device\/count: No data in response/,
  );
});
