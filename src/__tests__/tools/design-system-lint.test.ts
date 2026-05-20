import { describe, it, expect, vi } from 'vitest';
import { runDesignSystemLint } from '../../tools/design-system-lint.js';
import { makeLintArtifactHandler } from '../../tools/lint-artifact.js';
import { OdClient } from '../../od-client.js';

const TOKENS_CSS = ':root{--color-primary:#3b82f6;--color-bg:#ffffff;--space-1:4px;--space-2:8px}';
const COMPONENTS_CSS =
  '.btn{padding:var(--space-2);border-radius:4px}.btn-primary{background:var(--color-primary);color:#fff}';
const LAYOUT_CSS =
  '.container{max-width:1200px;margin:0 auto}.stack-md{display:flex;flex-direction:column;gap:var(--space-2)}';

const MANIFEST_OBJ = {
  version: 1,
  tokens: {
    colors: { primary: '#3b82f6', bg: '#ffffff' },
    type: { fontFamily: 'Inter, sans-serif', scale: [12, 14, 16, 20, 24, 32] },
    space: [4, 8, 12, 16, 24, 32, 48],
    unit: 'px',
    radii: [2, 4, 8],
    shadows: ['0 1px 2px rgba(0,0,0,0.1)'],
    breakpoints: [
      { name: 'sm', min: 640 },
      { name: 'md', min: 768 },
      { name: 'lg', min: 1024 },
    ],
    zIndex: { dropdown: 100, modal: 200 },
  },
  components: [
    {
      name: 'btn-primary',
      selector: '.btn-primary',
      role: 'button',
      snippet: '<button class="btn btn-primary">Label</button>',
    },
  ],
  layout: [{ name: 'container', selector: '.container', purpose: 'Centered content wrapper' }],
};

const VALID_DS_HTML = `<!doctype html>
<html data-od-artifact="design-system" data-od-version="1">
<head>
<style id="od-tokens">${TOKENS_CSS}</style>
<style id="od-components">${COMPONENTS_CSS}</style>
<style id="od-layout">${LAYOUT_CSS}</style>
<script type="application/json" id="od-design-system-manifest">
${JSON.stringify(MANIFEST_OBJ)}
</script>
</head>
<body></body>
</html>`;

function makePageHtml(bodyContent: string, extraHead = ''): string {
  return `<!doctype html>
<html>
<head>
<style id="od-tokens">${TOKENS_CSS}</style>
<style id="od-components">${COMPONENTS_CSS}</style>
<style id="od-layout">${LAYOUT_CSS}</style>
${extraHead}
</head>
<body>${bodyContent}</body>
</html>`;
}

describe('runDesignSystemLint', () => {
  describe('DS001 — Missing required style blocks', () => {
    it('positive: page missing od-components → DS001 finding naming od-components', () => {
      const pageHtml = `<!doctype html>
<html>
<head>
<style id="od-tokens">${TOKENS_CSS}</style>
<style id="od-layout">${LAYOUT_CSS}</style>
</head>
<body></body>
</html>`;
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      const ds001 = findings.filter((f) => f.code === 'DS001');
      expect(ds001.length).toBeGreaterThan(0);
      expect(ds001.some((f) => f.message.includes('od-components'))).toBe(true);
    });

    it('negative: page has all three style blocks → no DS001 findings', () => {
      const pageHtml = makePageHtml('');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS001')).toHaveLength(0);
    });
  });

  describe('DS002 — Off-palette colors in inline styles', () => {
    it('positive: off-palette color in inline style → DS002 finding', () => {
      const pageHtml = makePageHtml('<div style="color:#ff0000">text</div>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      const ds002 = findings.filter((f) => f.code === 'DS002');
      expect(ds002.length).toBeGreaterThan(0);
      expect(ds002[0].message).toContain('#ff0000');
    });

    it('negative: palette color in inline style → no DS002', () => {
      const pageHtml = makePageHtml('<div style="color:#3b82f6">text</div>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS002')).toHaveLength(0);
    });

    it('SVG skip: off-palette color inside svg → no DS002', () => {
      const pageHtml = makePageHtml('<svg><path fill="#ff0000"/></svg>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS002')).toHaveLength(0);
    });
  });

  describe('DS003 — Undocumented component classes', () => {
    it('positive: undocumented btn-warning class → DS003 warning', () => {
      const pageHtml = makePageHtml('<button class="btn btn-warning">Click</button>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      const ds003 = findings.filter((f) => f.code === 'DS003');
      expect(ds003.length).toBeGreaterThan(0);
      expect(ds003[0].severity).toBe('warning');
      expect(ds003[0].message).toContain('btn-warning');
    });

    it('negative: documented btn-primary class → no DS003', () => {
      const pageHtml = makePageHtml('<button class="btn btn-primary">Click</button>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS003')).toHaveLength(0);
    });
  });

  describe('DS004 — New custom properties', () => {
    it('positive: custom --color-accent not in design system → DS004 error', () => {
      const pageHtml = makePageHtml('', '<style>:root{--color-accent:#0f0}</style>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      const ds004 = findings.filter((f) => f.code === 'DS004');
      expect(ds004.length).toBeGreaterThan(0);
      expect(ds004[0].message).toContain('--color-accent');
    });

    it('negative: --color-primary exists in design system → no DS004', () => {
      const pageHtml = makePageHtml('', '<style>:root{--color-primary:#3b82f6}</style>');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS004')).toHaveLength(0);
    });
  });

  describe('DS005 — Token drift', () => {
    it('positive: od-tokens content differs from design system → DS005 error', () => {
      const pageHtml = `<!doctype html>
<html>
<head>
<style id="od-tokens">:root{--color-primary:#000000}</style>
<style id="od-components">${COMPONENTS_CSS}</style>
<style id="od-layout">${LAYOUT_CSS}</style>
</head>
<body></body>
</html>`;
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      const ds005 = findings.filter((f) => f.code === 'DS005');
      expect(ds005.length).toBeGreaterThan(0);
      expect(ds005[0].message).toContain('od-tokens');
    });

    it('negative: byte-identical tokens CSS → no DS005', () => {
      const pageHtml = makePageHtml('');
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS005')).toHaveLength(0);
    });
  });

  describe('Ignore-next-line escape hatch', () => {
    it('od-lint-ignore-next-line suppresses DS002 finding on the following element', () => {
      const pageHtml = makePageHtml(
        '<!-- od-lint-ignore-next-line -->\n<div style="color:#ff0000">text</div>',
      );
      const findings = runDesignSystemLint(pageHtml, VALID_DS_HTML);
      expect(findings.filter((f) => f.code === 'DS002')).toHaveLength(0);
    });
  });

  describe('Backward compatibility', () => {
    it('omitting designSystemHtml: handler produces no DS findings', async () => {
      const client = Object.create(OdClient.prototype) as OdClient;
      Object.defineProperty(client, 'authMode', { value: 'bearer', writable: true, configurable: true });
      Object.assign(client, {
        lintArtifact: vi.fn().mockResolvedValue({ findings: [] }),
      });

      const handler = makeLintArtifactHandler(client);
      const result = await handler({ html: '<html/>' }, { signal: new AbortController().signal });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).not.toContain('Design System:');
    });
  });
});
