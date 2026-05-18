import { describe, it, expect } from 'vitest';
import { composeBrief, type ComposeBriefArgs } from '../../tools/compose-brief.js';

describe('composeBrief helper', () => {
  it('form-only: renders [form answers] + [page brief], omits [brand spec]', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Pricing page',
      briefAnswers: {
        output: 'Slide deck',
        audience: 'Investors',
      },
    };
    const result = composeBrief(args);
    expect(result).toContain('[form answers — discovery]');
    expect(result).toContain('- output: Slide deck');
    expect(result).toContain('- audience: Investors');
    expect(result).toContain('[page brief]');
    expect(result).toContain('Pricing page');
    expect(result).not.toContain('[brand spec]');
  });

  it('brand-only: renders [brand spec] + [page brief], omits [form answers]', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Product overview',
      brandSpec: '# Brand\n- primary: oklch(0.55 0.18 250)',
    };
    const result = composeBrief(args);
    expect(result).toContain('[brand spec]');
    expect(result).toContain('# Brand');
    expect(result).toContain('[page brief]');
    expect(result).not.toContain('[form answers — discovery]');
  });

  it('both: renders all three sections in order with blank lines', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Home page hero',
      briefAnswers: {
        output: 'Web design',
        audience: 'SaaS founders',
      },
      brandSpec: '# Brand Spec\nAccent: blue',
    };
    const result = composeBrief(args);
    const lines = result.split('\n');
    const formIdx = lines.findIndex((l) => l.includes('[form answers — discovery]'));
    const brandIdx = lines.findIndex((l) => l.includes('[brand spec]'));
    const briefIdx = lines.findIndex((l) => l.includes('[page brief]'));

    expect(formIdx).toBeGreaterThan(-1);
    expect(brandIdx).toBeGreaterThan(formIdx);
    expect(briefIdx).toBeGreaterThan(brandIdx);
    // Check blank lines between sections
    expect(result).toContain('\n\n[brand spec]');
    expect(result).toContain('\n\n[page brief]');
  });

  it('minimal: only pagePrompt renders only [page brief]', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Contact form',
    };
    const result = composeBrief(args);
    expect(result).toBe('[page brief]\nContact form');
    expect(result).not.toContain('[form answers]');
    expect(result).not.toContain('[brand spec]');
  });

  it('string[] formatting: platforms joined by comma-space', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Mobile app',
      briefAnswers: {
        platform: ['iOS', 'Android', 'Web'],
        tone: ['Friendly', 'Modern'],
      },
    };
    const result = composeBrief(args);
    expect(result).toContain('- platform: iOS, Android, Web');
    expect(result).toContain('- tone: Friendly, Modern');
  });

  it('empty array: field omitted when array is empty', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'FAQ',
      briefAnswers: {
        output: 'FAQ section',
        platform: [],
        tone: [],
      },
    };
    const result = composeBrief(args);
    expect(result).toContain('- output: FAQ section');
    expect(result).not.toContain('- platform:');
    expect(result).not.toContain('- tone:');
  });

  it('undefined subfields: only defined fields rendered', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Checkout flow',
      briefAnswers: {
        audience: 'E-commerce buyers',
        // other fields undefined
      },
    };
    const result = composeBrief(args);
    expect(result).toContain('- audience: E-commerce buyers');
    expect(result).not.toContain('- output:');
    expect(result).not.toContain('- platform:');
    expect(result).not.toContain('- tone:');
    expect(result).not.toContain('- brand:');
    expect(result).not.toContain('- scale:');
    expect(result).not.toContain('- constraints:');
  });

  it('special characters: newlines/quotes/brackets preserved in values', () => {
    const args: ComposeBriefArgs = {
      pagePrompt: 'Page with "quotes" and [brackets] and\nnewline',
      briefAnswers: {
        constraints: 'Max 50KB\nNo external libs\n[Strict WCAG AA]',
      },
    };
    const result = composeBrief(args);
    expect(result).toContain('"quotes"');
    expect(result).toContain('[brackets]');
    expect(result).toContain('Max 50KB\nNo external libs\n[Strict WCAG AA]');
  });
});
