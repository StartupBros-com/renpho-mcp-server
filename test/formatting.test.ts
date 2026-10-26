import test from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatMeasurementList } from "../src/utils/formatting.js";
import type { RenphoMeasurement } from "../src/types/renpho.js";

for (const count of [0, 1, 20, 21, 100, 500]) {
  test(`formatMeasurementList renders all ${count} selected measurements`, () => {
    const measurements: RenphoMeasurement[] = Array.from(
      { length: count },
      (_, index) => ({
        id: `measurement-${index}`,
        time_stamp: 1_735_732_800 - index * 86_400,
        weight: 70 + index / 10,
        bodyfat: 20,
        muscle: 40,
        bmi: 22,
        user_id: `user-${index}`,
        scale_user_id: `scale-${index}`,
      }),
    );
    const original = structuredClone(measurements);

    const text = formatMeasurementList(measurements);

    assert.deepEqual(
      measurements,
      original,
      "formatting must not mutate the selected history",
    );

    if (count === 0) {
      assert.equal(text, "No measurements found.");
      return;
    }

    assert.ok(text.startsWith(`**Recent Measurements (${count})**\n\n`));
    const rows = text
      .split("\n")
      .filter((line) => line.startsWith("| "))
      .slice(1);
    const expectedRows = measurements.map((measurement) => {
      const date = formatDate(measurement.time_stamp).split(",")[0];
      return `| ${date} | ${measurement.weight.toFixed(1)} kg | 20.0% | 40.0% | 22.0 | ${measurement.user_id} | ${measurement.scale_user_id} |`;
    });

    assert.equal(rows.length, count);
    assert.deepEqual(
      rows,
      expectedRows,
      "every row must appear exactly once in input order",
    );
    assert.ok(
      text.endsWith(`${expectedRows[count - 1]}\n`),
      "the final selected row must be present",
    );
    assert.doesNotMatch(text, /more measurements/);
  });
}
