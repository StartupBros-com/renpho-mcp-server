import type { RenphoSyncDiagnostics } from '../../types/renpho.js';
import { formatDate } from './date.js';
import { formatMeasurement } from './measurement.js';

export function formatSyncDiagnostics(diagnostics: RenphoSyncDiagnostics): string {
  let text = `**Sync Diagnostics**\n\n`;
  text += `Current user: ${diagnostics.user.account_name || diagnostics.user.email} (${diagnostics.user.id})\n`;
  text += `Scale tables: ${diagnostics.scale_tables.length}\n`;
  text += `Family members: ${diagnostics.family_members.length}\n`;

  if (diagnostics.latest_measurement_age_hours != null) {
    text += `Visible latest age: ${diagnostics.latest_measurement_age_hours.toFixed(1)} hours\n`;
  }

  text += `\n**Scale Tables**\n`;
  for (const table of diagnostics.scale_tables) {
    text += `- ${table.table_name}: ${table.count} records, userIds=[${table.user_ids.join(', ')}]\n`;
  }

  if (diagnostics.family_members.length > 0) {
    text += `\n**Family Members**\n`;
    for (const member of diagnostics.family_members) {
      const name = member.account_name || [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || member.id;
      text += `- ${name} (${member.id || 'unknown-id'})\n`;
    }
  }

  text += `\n**Visible Latest Measurement**\n`;
  text += diagnostics.visible_latest_measurement
    ? `${formatMeasurement(diagnostics.visible_latest_measurement)}\n`
    : 'No visible measurement found.\n';

  text += `\n**Latest Associated Measurement Across All Linked Scale Users**\n`;
  text += diagnostics.latest_associated_measurement
    ? `${formatMeasurement(diagnostics.latest_associated_measurement)}\n`
    : 'No associated measurements found.\n';

  if (diagnostics.hidden_associated_measurements.length > 0) {
    text += `\n**Associated Measurements Not Currently Selected For Current User**\n`;
    for (const measurement of diagnostics.hidden_associated_measurements) {
      text += `- ${formatDate(measurement.time_stamp)} | ${measurement.weight?.toFixed(1) || 'N/A'} kg | bound=${measurement.user_id || '-'} | scale=${measurement.scale_user_id || '-'}\n`;
    }
  }

  return text;
}