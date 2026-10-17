import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { inspect } from "node:util";
import { RenphoApiService } from "../../src/services/renpho-api.js";

const LOGIN = "renpho-aggregation/user/login";
const DEVICES = "renpho-aggregation/device/count";
const CLASSIC = "RenphoHealth/scale/queryAllMeasureDataList";
const BODY = "RenphoHealth/scale/queryBodyCompositionMeasureData";
const ID = "9223372036854775806";
const CANARY = "PRIVATE_CANARY_42";
const key = Buffer.from("ed*wijdi$h6fe3ew");
function encrypted(raw: string) {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  const data = Buffer.concat([cipher.update(raw), cipher.final()]).toString(
    "base64",
  );
  return Response.json({ code: 101, data });
}
function decrypt(body: unknown): string {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([
    decipher.update(JSON.parse(String(body)).encryptData, "base64"),
    decipher.final(),
  ]).toString();
}
type Reply = () => Response | Promise<Response>;
function fixture(t: TestContext, overrides: Record<string, Reply> = {}) {
  const service = new RenphoApiService(
    "fixture@example.invalid",
    "fixture-password",
  );
  const calls: Array<{ path: string; raw: string }> = [];
  const routes: Record<string, Reply> = {
    [LOGIN]: () =>
      encrypted(
        `{"login":{"id":${ID},"token":"fixture-token","email":"fixture@example.invalid"}}`,
      ),
    [DEVICES]: () =>
      encrypted(
        `{"scale":[{"userIds":[${ID}],"count":1,"tableName":"fixture_table"}]}`,
      ),
    [CLASSIC]: () => encrypted("[]"),
    [BODY]: () => encrypted("[]"),
    ...overrides,
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init?: RequestInit) => {
      const path = String(url).replace("https://cloud.renpho.com/", "");
      assert.ok(
        Object.hasOwn(routes, path),
        `Unexpected route: ${String(url)}`,
      );
      const raw = decrypt(init?.body);
      calls.push({ path, raw });
      if (path !== LOGIN) {
        assert.equal((init?.headers as Record<string, string>).userId, ID);
        assert.equal(
          (init?.headers as Record<string, string>).token,
          "fixture-token",
        );
      }
      return routes[path]();
    },
  );
  return { service, calls };
}
function safeError(message: string) {
  return (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(
      inspect(error, { showHidden: true }),
      /PRIVATE_CANARY_42/,
    );
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(error.message, message);
    return true;
  };
}

test("combined encrypted histories retain exact IDs, metadata and reusable session/cache", async (t) => {
  const { service, calls } = fixture(t, {
    [CLASSIC]: () =>
      encrypted(
        `[{"id":${ID},"bUserId":${ID},"subUserId":${ID},"timeStamp":200,"weight":72,"bmi":24,"scaleName":"fixture"}]`,
      ),
    [BODY]: () =>
      encrypted(
        `[{"id":${ID},"bUserId":${ID},"subUserId":${ID},"timeStamp":200,"weight":72,"smmMass":31,"z20HandL":123}]`,
      ),
  });
  const rows = await service.getMeasurements();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, ID);
  assert.equal(rows[0].user_id, ID);
  assert.equal(rows[0].scale_user_id, ID);
  assert.equal(rows[0].bmi, 24);
  assert.equal(rows[0].scale_name, "fixture");
  assert.equal(rows[0].measurement_source, "eightElectrodeWeight");
  assert.deepEqual(rows[0].body_composition, { smmMass: 31, z20HandL: 123 });
  assert.deepEqual(await service.getLatestMeasurement(), rows[0]);
  assert.equal((await service.getCurrentUser()).id, ID);
  assert.equal(calls.length, 4);
  for (const call of calls.filter(
    ({ path }) => path === CLASSIC || path === BODY,
  )) {
    assert.ok(call.raw.includes(`"userIds":[${ID}]`));
    assert.ok(!call.raw.includes(`"${ID}"`));
  }
});

for (const reverse of [false, true]) {
  for (const binding of ["bUserId", "subUserId"] as const) {
    for (const value of [undefined, null, ""]) {
      test(`incomplete ${binding}=${String(value)} never enriches classic identity, reverse=${reverse}`, async (t) => {
        const tables = ["classic_table", "advanced_table"];
        if (reverse) tables.reverse();
        const advanced = {
          id: ID,
          bUserId: ID,
          subUserId: ID,
          timeStamp: 200,
          weight: 72,
          smmMass: 31,
          [binding]: value,
        };
        const { service, calls } = fixture(t, {
          [DEVICES]: () =>
            encrypted(
              JSON.stringify({
                scale: tables.map((tableName) => ({
                  tableName,
                  userIds: [ID],
                  count: 1,
                })),
              }),
            ),
          [CLASSIC]: () =>
            encrypted(
              JSON.parse(calls.at(-1)!.raw).tableName === "classic_table"
                ? `[{"id":${ID},"bUserId":${ID},"subUserId":${ID},"timeStamp":200,"weight":72,"bmi":24}]`
                : "[]",
            ),
          [BODY]: () =>
            encrypted(
              JSON.parse(calls.at(-1)!.raw).tableName === "advanced_table"
                ? JSON.stringify([advanced])
                : "[]",
            ),
        });
        const rows = await service.getMeasurements();
        const classic = rows.find(
          (row) => row.measurement_source === "fourElectrodeWeight",
        );
        assert.ok(classic);
        assert.equal(classic.user_id, ID);
        assert.equal(classic.scale_user_id, ID);
        assert.equal(classic.bmi, 24);
        assert.equal(classic.body_composition, undefined);
        const associated = await (service as any).getAssociatedMeasurements(
          undefined,
          10,
        );
        assert.equal(associated.length, 2);
        const separate = associated.find(
          (row: any) => row.measurement_source === "eightElectrodeWeight",
        );
        assert.equal(separate.body_composition.smmMass, 31);
        assert.equal(
          separate[binding === "bUserId" ? "user_id" : "scale_user_id"],
          value ?? undefined,
        );
      });
    }
  }
}

for (const path of [LOGIN, DEVICES, BODY]) {
  for (const code of [500, CANARY]) {
    test(`${path} redacts error message and validates code ${typeof code}`, async (t) => {
      const { service } = fixture(t, {
        [path]: () => Response.json({ code, msg: CANARY }),
      });
      const prefix =
        path === LOGIN
          ? "Authentication failed"
          : `API call failed for ${path}`;
      await assert.rejects(
        () => service.getMeasurements(),
        safeError(
          `${prefix}: code=${typeof code === "number" ? code : "invalid"}`,
        ),
      );
    });
  }
  for (const value of [null, CANARY, [], 42]) {
    test(`${path} rejects nonobject envelope ${JSON.stringify(value)}`, async (t) => {
      const { service } = fixture(t, { [path]: () => Response.json(value) });
      await assert.rejects(
        () => service.getMeasurements(),
        safeError(`Failed to parse API response from ${path}, status: 200`),
      );
    });
  }
}

for (const path of [LOGIN, DEVICES, CLASSIC]) {
  test(`${path} redacts transport failure details`, async (t) => {
    const { service } = fixture(t, {
      [path]: () => {
        throw new Error(CANARY);
      },
    });
    await assert.rejects(
      () => service.getMeasurements(),
      safeError(`Network error calling ${path}`),
    );
  });
}

for (const raw of ["null", "{}", '{"list":[]}']) {
  test(`body response shape ${raw} is explicit and never cached as partial success`, async (t) => {
    let attempts = 0;
    const { service, calls } = fixture(t, {
      [CLASSIC]: () =>
        encrypted(
          `[{"id":"classic","bUserId":${ID},"timeStamp":100,"weight":72}]`,
        ),
      [BODY]: () => {
        attempts++;
        return encrypted(raw);
      },
    });
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        () => service.getMeasurements(),
        safeError(
          "Unexpected body composition measurement response (expected array)",
        ),
      );
    }
    assert.equal(attempts, 2);
    assert.equal(calls.filter(({ path }) => path === CLASSIC).length, 2);
    assert.equal(calls.filter(({ path }) => path === LOGIN).length, 1);
  });
}

for (const failure of ["missing data", "unsupported", "network"] as const) {
  test(`body ${failure} stays explicit, without caching partial classic history`, async (t) => {
    let attempts = 0;
    const { service, calls } = fixture(t, {
      [CLASSIC]: () =>
        encrypted(
          `[{"id":"classic","bUserId":${ID},"timeStamp":100,"weight":72}]`,
        ),
      [BODY]: () => {
        attempts++;
        if (failure === "network") throw new Error(CANARY);
        return Response.json(
          failure === "missing data"
            ? { code: 101 }
            : { code: 599, msg: CANARY },
        );
      },
    });
    const message =
      failure === "network"
        ? `Network error calling ${BODY}`
        : `API call failed for ${BODY}: ${failure === "missing data" ? "No data in response" : "code=599"}`;
    for (let i = 0; i < 2; i++)
      await assert.rejects(() => service.getMeasurements(), safeError(message));
    assert.equal(attempts, 2);
    assert.equal(calls.filter(({ path }) => path === CLASSIC).length, 2);
  });
}

for (const withUnbound of [false, true]) {
  test(`foreign bound user cannot enter current-scale fallback; unbound=${withUnbound}`, async (t) => {
    const unbound = withUnbound
      ? `,{"id":"pending","subUserId":${ID},"timeStamp":100,"weight":71}`
      : "";
    const { service } = fixture(t, {
      [BODY]: () =>
        encrypted(
          `[{"id":"foreign","bUserId":"other","subUserId":${ID},"timeStamp":200,"weight":99}${unbound}]`,
        ),
    });
    const rows = await service.getMeasurements();
    assert.deepEqual(
      rows.map(({ id }) => id),
      withUnbound ? ["pending"] : [],
    );
    assert.equal(
      (await service.getLatestMeasurement())?.id ?? null,
      withUnbound ? "pending" : null,
    );
  });
}
