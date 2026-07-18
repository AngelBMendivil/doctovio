/** Calcula el Índice de Masa Corporal a partir de peso (kg) y talla (cm). */
export function calculateBMI(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  if (heightM <= 0) return null;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}
