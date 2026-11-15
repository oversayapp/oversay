/** "1 template", "3 templates"; pass `many` for irregular plurals ("categories"). */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
