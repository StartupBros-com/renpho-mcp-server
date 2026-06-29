import type { RenphoWeightTrend } from '../../types/renpho.js';

export function formatWeightTrend(trend: RenphoWeightTrend): string {
  const changeIcon = trend.change > 0 ? '+' : '';
  const direction = trend.change > 0 ? 'gained' : (trend.change < 0 ? 'lost' : 'maintained');

  let text = `**Weight Trend (${trend.period})**\n\n`;
  text += `You ${direction} ${Math.abs(trend.change).toFixed(1)} kg (${changeIcon}${trend.change_percent.toFixed(1)}%)\n\n`;
  text += `| Metric | Value |\n`;
  text += `|--------|-------|\n`;
  text += `| Start Weight | ${trend.start_weight.toFixed(1)} kg |\n`;
  text += `| Current Weight | ${trend.end_weight.toFixed(1)} kg |\n`;
  text += `| Min Weight | ${trend.min_weight.toFixed(1)} kg |\n`;
  text += `| Max Weight | ${trend.max_weight.toFixed(1)} kg |\n`;
  text += `| Avg Weight | ${trend.avg_weight.toFixed(1)} kg |\n`;
  text += `| Measurements | ${trend.measurement_count} |\n`;

  return text;
}