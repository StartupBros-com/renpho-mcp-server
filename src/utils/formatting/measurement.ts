import type { RenphoMeasurement } from '../../types/renpho.js';
import { formatDate } from './date.js';

export function formatMeasurement(m: RenphoMeasurement): string {
  let text = `Date: ${formatDate(m.time_stamp)}\n\n`;
  text += `**Core Metrics:**\n`;
  text += `- Weight: ${m.weight?.toFixed(1) || 'N/A'} kg\n`;
  text += `- BMI: ${m.bmi?.toFixed(1) || 'N/A'}\n`;
  text += `- Body Fat: ${m.bodyfat?.toFixed(1) || 'N/A'}%\n`;
  text += `- Muscle Mass: ${m.muscle?.toFixed(1) || 'N/A'}%\n`;
  text += `- Water: ${m.water?.toFixed(1) || 'N/A'}%\n`;
  text += `- Bone Mass: ${m.bone?.toFixed(1) || 'N/A'} kg\n`;

  if (m.visceral_fat || m.bmr || m.metabolic_age || m.body_age) {
    text += `\n**Metabolic:**\n`;
    if (m.visceral_fat) text += `- Visceral Fat: ${m.visceral_fat}\n`;
    if (m.bmr) text += `- BMR: ${m.bmr.toFixed(0)} kcal/day\n`;
    if (m.metabolic_age) text += `- Metabolic Age: ${m.metabolic_age} years\n`;
    else if (m.body_age) text += `- Body Age: ${m.body_age} years\n`;
  }

  if (m.protein || m.subcutaneous_fat || m.skeletal_muscle) {
    text += `\n**Extended:**\n`;
    if (m.protein) text += `- Protein: ${m.protein.toFixed(1)}%\n`;
    if (m.subcutaneous_fat) text += `- Subcutaneous Fat: ${m.subcutaneous_fat.toFixed(1)}%\n`;
    if (m.skeletal_muscle) text += `- Skeletal Muscle: ${m.skeletal_muscle.toFixed(1)}%\n`;
  }

  if (m.heart_rate) {
    text += `\n**Cardiovascular:**\n`;
    text += `- Heart Rate: ${m.heart_rate} bpm\n`;
    if (m.cardiac_index) text += `- Cardiac Index: ${m.cardiac_index}\n`;
  }

  text += `\n**Source:**\n`;
  if (m.user_id) text += `- Bound User ID: ${m.user_id}\n`;
  if (m.scale_user_id) text += `- Scale User ID: ${m.scale_user_id}\n`;
  if (m.method != null) text += `- Method: ${m.method}\n`;
  if (m.is_auto != null) text += `- Auto Source Flag: ${m.is_auto}\n`;
  if (m.is_new != null) text += `- New Flag: ${m.is_new ? 'true' : 'false'}\n`;

  return text;
}

export function formatMeasurementList(measurements: RenphoMeasurement[]): string {
  if (measurements.length === 0) {
    return 'No measurements found.';
  }

  let text = `**Recent Measurements (${measurements.length})**\n\n`;
  text += `| Date | Weight | Body Fat | Muscle | BMI | Bound User | Scale User |\n`;
  text += `|------|--------|----------|--------|-----|------------|------------|\n`;

  for (const m of measurements.slice(0, 20)) {
    const date = formatDate(m.time_stamp).split(',')[0];
    text += `| ${date} | ${m.weight?.toFixed(1) || '-'} kg | ${m.bodyfat?.toFixed(1) || '-'}% | ${m.muscle?.toFixed(1) || '-'}% | ${m.bmi?.toFixed(1) || '-'} | ${m.user_id || '-'} | ${m.scale_user_id || '-'} |\n`;
  }

  if (measurements.length > 20) {
    text += `\n...and ${measurements.length - 20} more measurements`;
  }

  return text;
}