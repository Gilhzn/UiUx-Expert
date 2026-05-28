import type { CssRule } from '../cssBuilder';
import type { TransformId, UxDna } from '../../storage/types';
import { typographyRules } from './typography';
import { spacingRules } from './spacing';
import { contrastRules } from './contrast';
import { declutterRules } from './declutter';
import { focusModeRules } from './focusMode';
import { motionRules } from './motion';

export interface TransformOutput {
  prelude?: string;
  rules: CssRule[];
}

const REGISTRY: Record<TransformId, (dna: UxDna) => TransformOutput> = {
  typography: (dna) => ({ rules: typographyRules(dna) }),
  spacing: (dna) => ({ rules: spacingRules(dna) }),
  contrast: (dna) => ({ rules: contrastRules(dna) }),
  declutter: (dna) => ({ rules: declutterRules(dna) }),
  focusMode: (dna) => ({ rules: focusModeRules(dna) }),
  motion: (dna) => ({ rules: motionRules(dna) }),
};

export function runTransforms(active: TransformId[], dna: UxDna): TransformOutput {
  const allRules: CssRule[] = [];
  const preludes: string[] = [];
  for (const id of active) {
    const out = REGISTRY[id](dna);
    if (out.prelude) preludes.push(out.prelude);
    allRules.push(...out.rules);
  }
  return { prelude: preludes.length > 0 ? preludes.join('\n') : undefined, rules: allRules };
}
