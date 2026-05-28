export interface CssRule {
  selector: string;
  declarations: Record<string, string>;
}

export interface CssBundle {
  layerName: string;
  prelude?: string;
  rules: CssRule[];
}

export function buildCss(bundle: CssBundle): string {
  const layerDecl = `@layer ${bundle.layerName};`;
  const body = bundle.rules
    .map((r) => {
      const decls = Object.entries(r.declarations)
        .map(([k, v]) => `${k}:${v} !important`)
        .join(';');
      return `${r.selector}{${decls}}`;
    })
    .join('\n');
  const layered = body ? `@layer ${bundle.layerName}{\n${body}\n}` : '';
  return [bundle.prelude ?? '', layerDecl, layered].filter(Boolean).join('\n');
}
