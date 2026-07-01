import type { RenphoUser } from '../../types/renpho.js';

export function formatUser(user: RenphoUser): string {
  let text = `User: ${user.account_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}\n`;
  text += `Email: ${user.email}\n`;
  if (user.height) text += `Height: ${user.height} cm\n`;
  if (user.weight_goal) text += `Weight Goal: ${user.weight_goal} kg\n`;
  if (user.measure_last_time) text += `App Last Measurement Time: ${user.measure_last_time}\n`;
  if (user.measure_last_weight) text += `App Last Measurement Weight: ${user.measure_last_weight}\n`;
  return text;
}