import { inferEyeColorFamilies } from './irisColorFamily';

/** Simplified eye-color buckets used in classic 2-gene inheritance tables. */
export type InheritanceEyeColor = 'brown' | 'green' | 'blueGray';

export type ChildColorOdds = {
  green: string;
  blueGray: string;
  brown: string;
  /** True when brown parent may carry hidden light alleles (table footnote *). */
  heterozygousNote: boolean;
};

const PAIR_ODDS: Record<string, ChildColorOdds> = {
  'green|green': { green: '~75 %', blueGray: '~25 %', brown: '< 1 %', heterozygousNote: false },
  'green|blueGray': { green: '~50 %', blueGray: '~50 %', brown: '0 %', heterozygousNote: false },
  'green|brown': { green: '~37–50 %', blueGray: '~12 %', brown: '~50 %', heterozygousNote: true },
  'blueGray|blueGray': { green: '~1 %', blueGray: '~99 %', brown: '0 %', heterozygousNote: false },
  'blueGray|brown': { green: '~0 %', blueGray: '~50 %', brown: '~50 %', heterozygousNote: true },
  'brown|brown': { green: '~18 %', blueGray: '~7 %', brown: '~75 %', heterozygousNote: true },
};

const ORDER: InheritanceEyeColor[] = ['brown', 'green', 'blueGray'];

function pairKey(a: InheritanceEyeColor, b: InheritanceEyeColor): string {
  const sorted = [a, b].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  return `${sorted[0]}|${sorted[1]}`;
}

/** Map detected iris palette to one inheritance-table category. */
export function inferInheritanceEyeColor(primaryHex: string, paletteHexes: string[]): InheritanceEyeColor {
  const families = inferEyeColorFamilies(primaryHex, paletteHexes);
  const hasBrown = families.some((f) => f === 'brown' || f === 'amber' || f === 'hazel');
  const hasGreen = families.includes('green');
  const hasBlueGray = families.includes('blue') || families.includes('gray');

  if (hasGreen && !hasBrown) return 'green';
  if (hasBlueGray && !hasBrown) return 'blueGray';
  if (hasBrown) return 'brown';
  if (hasGreen) return 'green';
  if (hasBlueGray) return 'blueGray';
  return 'brown';
}

export function lookupChildColorOdds(
  self: InheritanceEyeColor,
  partner: InheritanceEyeColor
): ChildColorOdds {
  return PAIR_ODDS[pairKey(self, partner)] ?? PAIR_ODDS['brown|brown']!;
}

export const INHERITANCE_COLOR_OPTIONS: InheritanceEyeColor[] = ['brown', 'green', 'blueGray'];
