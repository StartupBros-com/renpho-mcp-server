import type { RenphoMeasurement } from '../../types/renpho.js';
import type { CachedSession } from './types.js';

export function mapMeasurement(m: Record<string, any>): RenphoMeasurement {
  return {
    id: m.__idString || String(m.id),
    time_stamp: Number(m.timeStamp),
    weight: m.weight,
    bmi: m.bmi,
    bodyfat: m.bodyfat,
    water: m.water,
    muscle: m.muscle,
    bone: m.bone,
    bmr: m.bmr,
    visceral_fat: m.visfat,
    protein: m.protein,
    body_age: m.bodyage,
    subcutaneous_fat: m.subfat,
    skeletal_muscle: m.sinew,
    heart_rate: m.heartRate,
    cardiac_index: m.cardiacIndex,
    resistance: m.resistance,
    fat_free_weight: m.fatFreeWeight,
    metabolic_age: m.bodyage,
    user_id: m.__bUserIdString || (m.bUserId != null ? String(m.bUserId) : undefined),
    scale_user_id: m.__subUserIdString || (m.subUserId != null ? String(m.subUserId) : undefined),
    mac: m.mac,
    internal_model: m.internalModel,
    scale_name: m.scaleName,
    method: m.method,
    pregnant_flag: undefined,
    sport_flag: m.sportFlag,
    is_auto: m.isAuto,
    is_new: m.isNew,
    invalid_flag: m.invalidFlag
  };
}

export function dedupeAndSortMeasurements(measurements: RenphoMeasurement[]): RenphoMeasurement[] {
  const uniqueById = new Map<string, RenphoMeasurement>();
  for (const measurement of measurements) {
    if (!uniqueById.has(measurement.id)) {
      uniqueById.set(measurement.id, measurement);
    }
  }

  return Array.from(uniqueById.values()).sort((a, b) => b.time_stamp - a.time_stamp);
}

export function selectMeasurementsForCurrentUser(
  measurements: RenphoMeasurement[],
  session: CachedSession
): RenphoMeasurement[] {
  const directlyBound = measurements.filter(measurement => measurement.user_id === session.userId);
  if (directlyBound.length > 0) {
    return directlyBound;
  }

  if (session.scaleUserIds.length === 1) {
    return measurements.filter(measurement => measurement.scale_user_id === session.scaleUserIds[0]);
  }

  return measurements.filter(measurement => measurement.scale_user_id === session.scaleUserIds[0]);
}