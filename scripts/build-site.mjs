#!/usr/bin/env node
import { marked } from 'marked';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE_SRC = join(ROOT, 'site');
const OUT = join(ROOT, 'dist', 'site');

const TEMPLATE_TOKENS = ['{{CHANGELOG_CONTENT}}', '{{BUILD_DATE}}', '{{COMMIT_SHA}}'];

function slugForVersionHeading(rawText) {
  const bracketMatch = /^\s*\[([^\]]+)\]/.exec(rawText);
  if (!bracketMatch) return null;
  let slug = bracketMatch[1].toLowerCase().replace(/\./g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (/unreleased/i.test(rawText)) slug += '-unreleased';
  return slug;
}

export function renderChangelog(markdown) {
  const emittedSlugs = new Set();
  const collisions = [];

  const renderer = {
    heading({ tokens, depth, text, raw }) {
      const inner = this.parser.parseInline(tokens);
      const shifted = Math.min(depth + 1, 6);
      const headingText = (text ?? raw ?? '').trim();

      if (depth === 2) {
        const slug = slugForVersionHeading(headingText);
        if (slug) {
          if (emittedSlugs.has(slug)) {
            collisions.push({ slug, heading: headingText });
            return `<h${shifted}>${inner}</h${shifted}>\n`;
          }
          emittedSlugs.add(slug);
          return `<h${shifted} id="${slug}"><a class="anchor" href="#${slug}" aria-label="Permalink for ${slug}">#</a>${inner}</h${shifted}>\n`;
        }
      }
      return `<h${shifted}>${inner}</h${shifted}>\n`;
    },
  };

  marked.use({ renderer });
  const html = marked.parse(markdown, { async: false });

  if (collisions.length > 0) {
    const lines = collisions.map(c => `  - slug "${c.slug}" from heading: ${c.heading}`).join('\n');
    throw new Error(`Duplicate version slug(s) detected in CHANGELOG.md — fix the headings before deploy:\n${lines}`);
  }

  return html;
}

function substitute(template, values) {
  let out = template;
  for (const [token, value] of Object.entries(values)) {
    out = out.split(token).join(value);
  }
  for (const token of TEMPLATE_TOKENS) {
    if (out.includes(token)) {
      throw new Error(`Unsubstituted token "${token}" remains in output — every token must be provided.`);
    }
  }
  return out;
}

function build() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const changelogMd = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const changelogHtml = renderChangelog(changelogMd);
  const template = readFileSync(join(SITE_SRC, 'changelog.html.template'), 'utf8');

  const buildDate = new Date().toISOString().slice(0, 10);
  const commitSha = (process.env.GITHUB_SHA || 'local').slice(0, 7);

  const changelogOut = substitute(template, {
    '{{CHANGELOG_CONTENT}}': changelogHtml,
    '{{BUILD_DATE}}': buildDate,
    '{{COMMIT_SHA}}': commitSha,
  });
  writeFileSync(join(OUT, 'changelog.html'), changelogOut, 'utf8');

  copyFileSync(join(SITE_SRC, 'index.html'), join(OUT, 'index.html'));
  copyFileSync(join(SITE_SRC, '404.html'), join(OUT, '404.html'));
  copyFileSync(join(SITE_SRC, 'styles.css'), join(OUT, 'styles.css'));
  copyFileSync(join(SITE_SRC, 'favicon.svg'), join(OUT, 'favicon.svg'));
  copyFileSync(join(SITE_SRC, 'robots.txt'), join(OUT, 'robots.txt'));

  const written = ['index.html', 'changelog.html', '404.html', 'styles.css', 'favicon.svg', 'robots.txt'];
  let total = 0;
  for (const f of written) {
    const size = statSync(join(OUT, f)).size;
    total += size;
    console.log(`  ${String(size).padStart(7)} bytes  ${f}`);
  }
  console.log(`  ${String(total).padStart(7)} bytes  TOTAL`);

  if (total > 100 * 1024) {
    throw new Error(`Site total ${total} bytes exceeds 100 KB budget.`);
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  try {
    build();
  } catch (err) {
    console.error(`build-site failed: ${err.message}`);
    process.exit(1);
  }
}
