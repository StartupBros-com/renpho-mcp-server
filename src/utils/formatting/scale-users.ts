import type { RenphoScaleUser } from '../../types/renpho.js';

export function formatScaleUsers(scaleUsers: RenphoScaleUser[]): string {
  if (scaleUsers.length === 0) {
    return 'No scale users found.';
  }

  let text = `**Scale Users (${scaleUsers.length})**\n\n`;
  text += `| Scale User ID | Table | Count |\n`;
  text += `|---------------|-------|-------|\n`;

  for (const scaleUser of scaleUsers) {
    text += `| ${scaleUser.user_id} | ${scaleUser.table_name || '-'} | ${scaleUser.count ?? '-'} |\n`;
  }

  return text;
}