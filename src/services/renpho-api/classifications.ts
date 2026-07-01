export function classifyBMI(bmi?: number): string {
  if (!bmi) return 'Unknown';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

export function classifyBodyFat(bodyfat?: number, isMale: boolean = true): string {
  if (!bodyfat) return 'Unknown';
  if (isMale) {
    if (bodyfat < 6) return 'Essential';
    if (bodyfat < 14) return 'Athletes';
    if (bodyfat < 18) return 'Fitness';
    if (bodyfat < 25) return 'Average';
    return 'Obese';
  } else {
    if (bodyfat < 14) return 'Essential';
    if (bodyfat < 21) return 'Athletes';
    if (bodyfat < 25) return 'Fitness';
    if (bodyfat < 32) return 'Average';
    return 'Obese';
  }
}

export function classifyVisceralFat(level?: number): string {
  if (!level) return 'Unknown';
  if (level <= 9) return 'Healthy';
  if (level <= 14) return 'High';
  return 'Very High';
}