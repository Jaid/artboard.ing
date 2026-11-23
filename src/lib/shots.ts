/** the most images one click on Generate asks for */
export const maxShots = 8
/** every choice of the shots dropdown */
export const shotCounts: ReadonlyArray<number> = Array.from({length: maxShots}, (_, index) => index + 1)
/** a whole number of shots from 1 to 8; anything unusable becomes 1 */
export const normalizeShots = (value: unknown) => {
  const number = Math.trunc(Number(value))
  return Number.isFinite(number) ? Math.min(maxShots, Math.max(1, number)) : 1
}
