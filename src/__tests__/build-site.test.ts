import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'dist', 'site');
const EXPECTED_FILES = ['index.html', 'changelog.html', '404.html', 'styles.css', 'favicon.svg', 'robots.txt'];
const SITE_URL = 'https://nano-step.github.io/open-design-mcp/';

describe('build-site', () => {
  beforeAll(() => {
    execSync('node scripts/build-site.mjs', { cwd: ROOT, stdio: 'pipe' });
  });

  it('emits all six expected files into dist/site/', () => {
    for (const f of EXPECTED_FILES) {
      expect(existsSync(join(OUT, f)), `missing: ${f}`).toBe(true);
    }
  });

  it('renders the current latest release with a stable anchor id', () => {
    const html = readFileSync(join(OUT, 'changelog.html'), 'utf8');
    expect(html).toMatch(/id="0-17-0"/);
  });

  it('substitutes every template token (no leakage)', () => {
    const html = readFileSync(join(OUT, 'changelog.html'), 'utf8');
    expect(html).not.toContain('{{CHANGELOG_CONTENT}}');
    expect(html).not.toContain('{{BUILD_DATE}}');
    expect(html).not.toContain('{{COMMIT_SHA}}');
  });

  it('keeps the total weight under 100 KB raw on-disk', () => {
    let total = 0;
    const report: string[] = [];
    for (const f of EXPECTED_FILES) {
      const size = statSync(join(OUT, f)).size;
      total += size;
      report.push(`${f}: ${size}B`);
    }
    expect(total, `over budget — sizes: ${report.join(', ')}`).toBeLessThanOrEqual(100 * 1024);
  });

  it('embeds the canonical site URL on the landing page', () => {
    const html = readFileSync(join(OUT, 'index.html'), 'utf8');
    expect(html).toContain(SITE_URL);
  });

  it('produces exactly one <h1> on the changelog page (depth-shift works)', () => {
    const html = readFileSync(join(OUT, 'changelog.html'), 'utf8');
    const matches = html.match(/<h1\b[^>]*>/gi) ?? [];
    expect(matches.length, `expected 1 <h1>, found ${matches.length}`).toBe(1);
  });

  it('throws on duplicate version slugs', async () => {
    const { renderChangelog } = await import('../../scripts/build-site.mjs');
    const dupFixture = `# Changelog\n\n## [0.17.0] — 2026-05-20\n\nFirst.\n\n## [0.17.0] — 2026-05-20\n\nSecond.\n`;
    expect(() => renderChangelog(dupFixture)).toThrow(/Duplicate version slug/i);
  });

  it('does not ship dist/site/ in the npm tarball', () => {
    const output = execSync('npm pack --dry-run --json', { cwd: ROOT, encoding: 'utf8' });
    const parsed = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
    const allPaths = parsed.flatMap(pkg => pkg.files.map(f => f.path));
    const leaked = allPaths.filter(p => p.startsWith('dist/site'));
    expect(leaked, `dist/site leaked into tarball: ${leaked.join(', ')}`).toEqual([]);
  });
});
