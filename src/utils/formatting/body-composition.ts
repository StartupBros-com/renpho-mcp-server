import type { RenphoBodyComposition } from '../../types/renpho.js';
import { formatDate } from './date.js';

export function formatBodyComposition(bc: RenphoBodyComposition): string {
  let text = `**Body Composition Summary**\n`;
  text += `Measured: ${formatDate(bc.measurement.time_stamp)}\n\n`;

  text += `| Metric | Value | Status |\n`;
  text += `|--------|-------|--------|\n`;
  text += `| Weight | ${bc.formatted.weight} | - |\n`;
  text += `| BMI | ${bc.formatted.bmi} | ${bc.classifications.bmi_category} |\n`;
  text += `| Body Fat | ${bc.formatted.bodyfat} | ${bc.classifications.bodyfat_category} |\n`;
  text += `| Muscle | ${bc.formatted.muscle} | - |\n`;
  text += `| Water | ${bc.formatted.water} | - |\n`;
  text += `| Bone Mass | ${bc.formatted.bone} | - |\n`;
  text += `| Visceral Fat | ${bc.formatted.visceral_fat} | ${bc.classifications.visceral_fat_category} |\n`;
  text += `| Metabolic Age | ${bc.formatted.metabolic_age} | - |\n`;
  text += `| BMR | ${bc.formatted.bmr} | - |\n`;

  return text;
}