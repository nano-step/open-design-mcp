import { extractDesignSystem } from './extract-design-system.js';
import type { ExtractedDesignSystem } from '../types/design-system.js';

export interface DsLintFinding {
  code: 'DS001' | 'DS002' | 'DS003' | 'DS004' | 'DS005';
  severity: 'error' | 'warning';
  message: string;
}

const STYLE_BLOCK_IDS = ['od-tokens', 'od-components', 'od-layout'] as const;
type StyleBlockId = (typeof STYLE_BLOCK_IDS)[number];

const COLOR_PATTERN =
  /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

const CUSTOM_PROP_PATTERN = /(--(?:color|space)-[a-zA-Z0-9_-]+)\s*:/g;

function extractStyleBlockContent(html: string, id: string): string | null {
  const regex = new RegExp(`<style\\s+id="${id}"[^>]*>([\\s\\S]*?)<\\/style>`);
  const match = html.match(regex);
  return match ? match[1] : null;
}

function stripSvgContent(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/gi, '');
}

function extractInlineStyleColors(html: string): string[] {
  const strippedHtml = stripSvgContent(html);
  const colors: string[] = [];
  const styleAttrPattern = /\bstyle="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = styleAttrPattern.exec(strippedHtml)) !== null) {
    const styleValue = m[1];
    let colorMatch: RegExpExecArray | null;
    const colorRe = new RegExp(COLOR_PATTERN.source, 'g');
    while ((colorMatch = colorRe.exec(styleValue)) !== null) {
      colors.push(colorMatch[0]);
    }
  }
  return colors;
}

function extractClassNames(html: string, tagPattern: RegExp, classPattern: RegExp): string[] {
  const classes: string[] = [];
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(html)) !== null) {
    const tagHtml = tagMatch[0];
    const classAttrMatch = /\bclass="([^"]*)"/.exec(tagHtml);
    if (!classAttrMatch) continue;
    const classNames = classAttrMatch[1].split(/\s+/);
    for (const cls of classNames) {
      if (classPattern.test(cls)) {
        classes.push(cls);
      }
    }
  }
  return classes;
}

function extractCustomProps(html: string): string[] {
  const props = new Set<string>();
  // From <style> blocks
  const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleBlockRe.exec(html)) !== null) {
    const css = styleMatch[1];
    const propRe = new RegExp(CUSTOM_PROP_PATTERN.source, 'g');
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRe.exec(css)) !== null) {
      props.add(propMatch[1]);
    }
  }
  // From style="" attributes
  const styleAttrRe = /\bstyle="([^"]*)"/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = styleAttrRe.exec(html)) !== null) {
    const propRe = new RegExp(CUSTOM_PROP_PATTERN.source, 'g');
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRe.exec(attrMatch[1])) !== null) {
      props.add(propMatch[1]);
    }
  }
  return Array.from(props);
}

function applyIgnoreComments(html: string, findings: DsLintFinding[]): DsLintFinding[] {
  const ignoreMarker = '<!-- od-lint-ignore-next-line -->';
  if (!html.includes(ignoreMarker)) return findings;

  const suppressedTerms: string[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = html.indexOf(ignoreMarker, searchFrom);
    if (idx === -1) break;
    // Find the next line after the comment
    const afterComment = html.slice(idx + ignoreMarker.length);
    const nextLineMatch = afterComment.match(/\n?([^\n]*)/);
    if (nextLineMatch) {
      suppressedTerms.push(nextLineMatch[1].trim());
    }
    searchFrom = idx + ignoreMarker.length;
  }

  if (suppressedTerms.length === 0) return findings;

  return findings.filter((f) => {
    return !suppressedTerms.some((term) => {
      if (!term) return false;
      // Extract identifiers from the term (colors, class names, property names)
      const colorMatches = term.match(COLOR_PATTERN) ?? [];
      const classMentions = term.match(/btn-\w+|input-\w+/g) ?? [];
      const propMentions = term.match(/--(?:color|space)-[a-zA-Z0-9_-]+/g) ?? [];
      const identifiers = [...colorMatches, ...classMentions, ...propMentions];
      return identifiers.some((id) => f.message.includes(id));
    });
  });
}

export function runDesignSystemLint(pageHtml: string, designSystemHtml: string): DsLintFinding[] {
  let ds: ExtractedDesignSystem;
  try {
    ds = extractDesignSystem(designSystemHtml);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return [{ code: 'DS001', severity: 'error', message: 'Failed to parse design system: ' + msg }];
  }

  const findings: DsLintFinding[] = [];

  // DS001 — Missing required style blocks
  const dsBlockCss: Record<StyleBlockId, string> = {
    'od-tokens': ds.tokensCss,
    'od-components': ds.componentsCss,
    'od-layout': ds.layoutCss,
  };

  const presentBlocks: Partial<Record<StyleBlockId, string>> = {};
  for (const id of STYLE_BLOCK_IDS) {
    const content = extractStyleBlockContent(pageHtml, id);
    if (content === null) {
      findings.push({
        code: 'DS001',
        severity: 'error',
        message: `missing required style block: ${id}`,
      });
    } else {
      presentBlocks[id] = content;
    }
  }

  // DS005 — Token drift
  for (const id of STYLE_BLOCK_IDS) {
    const pageContent = presentBlocks[id];
    if (pageContent === undefined) continue; // already reported as DS001
    if (pageContent !== dsBlockCss[id]) {
      findings.push({
        code: 'DS005',
        severity: 'error',
        message: `token drift: <style id="${id}"> content differs from design system`,
      });
    }
  }

  // DS002 — Off-palette colors in inline styles
  const paletteColors = new Set(Object.values(ds.manifest.tokens.colors).map((c) => c.toLowerCase()));
  const inlineColors = extractInlineStyleColors(pageHtml);
  const seenOffPalette = new Set<string>();
  for (const color of inlineColors) {
    const normalized = color.toLowerCase();
    if (!paletteColors.has(normalized) && !seenOffPalette.has(normalized)) {
      seenOffPalette.add(normalized);
      findings.push({
        code: 'DS002',
        severity: 'error',
        message: `off-palette color ${color} in inline style`,
      });
    }
  }

  // DS003 — Undocumented component classes
  const catalogNames = new Set(ds.manifest.components.map((c) => c.name));
  const interactiveTagRe = /<(?:button|input|a)\b[^>]*>/gi;
  const componentClassPattern = /^(?:btn-|input-).+/;
  const componentClasses = extractClassNames(pageHtml, interactiveTagRe, componentClassPattern);
  const seenUndocumented = new Set<string>();
  for (const cls of componentClasses) {
    if (!catalogNames.has(cls) && !seenUndocumented.has(cls)) {
      seenUndocumented.add(cls);
      findings.push({
        code: 'DS003',
        severity: 'warning',
        message: `undocumented component class: ${cls}`,
      });
    }
  }

  // DS004 — New custom properties not in design system
  const pageCustomProps = extractCustomProps(pageHtml);
  const systemTokensCss = ds.tokensCss;
  const seenNewProp = new Set<string>();
  for (const prop of pageCustomProps) {
    if (!systemTokensCss.includes(prop) && !seenNewProp.has(prop)) {
      seenNewProp.add(prop);
      findings.push({
        code: 'DS004',
        severity: 'error',
        message: `new custom property not in design system: ${prop}`,
      });
    }
  }

  return applyIgnoreComments(pageHtml, findings);
}
