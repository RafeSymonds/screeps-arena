/**
 * Convert the Screeps Arena reference docs (a single server-rendered HTML page
 * shipped inside the game client) into one markdown file per entity.
 *
 * Usage: node tools/docs-to-markdown.mjs <arena-docs/index.html> <out-dir>
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

const [, , htmlPath, outDir] = process.argv;
if (!htmlPath || !outDir) {
  console.error('usage: node tools/docs-to-markdown.mjs <index.html> <out-dir>');
  process.exit(1);
}

const root = parse(readFileSync(htmlPath, 'utf8'));
const version = root.querySelector('html')?.getAttribute('data-version') ?? 'unknown';

const slug = name => name.replace(/[^\w.-]/g, '_');
const fileFor = name => `${slug(name)}.md`;

const turndown = new TurndownService({ codeBlockStyle: 'fenced', headingStyle: 'atx' });
// The docs are full of ERR_* names and negative numbers; turndown's escaping
// turns those into ERR\_NOT\_OWNER and \-1, which reads badly.
turndown.escape = s => s;

// Cross-references point at anchors on the single-page docs. Which of them
// become real files isn't known until every page is collected, so emit a
// placeholder and resolve it at the end.
turndown.addRule('internal-links', {
  filter: node => node.nodeName === 'A' && (node.getAttribute('href') ?? '').startsWith('#'),
  replacement: (content, node) => {
    const id = node.getAttribute('href').slice(1);
    const owner = id.split('.')[0].split('::').pop();
    return `@@${owner}|${content}@@`;
  },
});

// Descriptions embed real tables (the creep body-part table, for one); turndown
// has no table support out of the box and would flatten them into prose.
turndown.addRule('tables', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from(node.rows, tr =>
      Array.from(tr.cells, cell =>
        turndown.turndown(cell.innerHTML).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim(),
      ),
    );
    if (rows.length === 0) return '';
    // Many tables in these docs (return codes, nested property lists) ship with
    // no <thead>. Rendering them as a table would eat the first data row, so
    // they become a list instead.
    if (!node.tHead) {
      return (
        '\n\n' +
        rows
          .map(r => `- **${r[0]}**${r.length > 1 ? ` — ${r.slice(1).join(' — ')}` : ''}`)
          .join('\n') +
        '\n\n'
      );
    }
    const width = Math.max(...rows.map(r => r.length));
    const pad = r => [...r, ...Array(width - r.length).fill('')];
    const [header, ...body] = rows;
    return (
      '\n\n' +
      [
        `| ${pad(header).join(' | ')} |`,
        `| ${Array(width).fill('---').join(' | ')} |`,
        ...body.map(r => `| ${pad(r).join(' | ')} |`),
      ].join('\n') +
      '\n\n'
    );
  },
});

const md = html => (html ? turndown.turndown(html).trim() : '');
const text = node => node?.text?.trim() ?? '';
const decode = s =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** nav section headers ("Objects", "Functions", "Power Split", …) → entity ids */
const sectionOf = new Map();
{
  let current = null;
  for (const child of root.querySelectorAll('aside nav > *')) {
    if ((child.getAttribute('class') ?? '').includes('navigation_nav-header')) {
      current = child.text.trim();
    } else if (current) {
      for (const a of child.querySelectorAll('a')) {
        const id = a.getAttribute('href').slice(1);
        if (!id.includes('.')) sectionOf.set(id.split('::').pop(), current);
      }
    }
  }
}

function memberName(el) {
  // Grouped constants nest their members, so a descendant search would return
  // the first child's name. Only this element's own header counts.
  const header = el.childNodes.find(n => n.rawTagName === 'header');
  const h = header?.querySelector('h4') ?? header?.querySelector('h3');
  // The heading repeats the fully-qualified name in a hidden span; drop it.
  return h?.childNodes
    .filter(n => n.rawTagName !== 'span' && n.rawTagName !== 'div')
    .map(n => n.text)
    .join('')
    .trim();
}

function renderArgs(node) {
  const rows = node?.querySelectorAll('tbody tr') ?? [];
  if (rows.length === 0) return '';
  const cell = n =>
    md(n?.innerHTML ?? '')
      .replace(/\n+/g, ' ')
      .replace(/\|/g, '\\|');
  return [
    '| parameter | type | description |',
    '| --- | --- | --- |',
    ...rows.map(tr => {
      const [name, type, desc] = tr.querySelectorAll('td');
      return `| \`${text(name)}\` | ${cell(type)} | ${cell(desc)} |`;
    }),
  ].join('\n');
}

function renderExample(block) {
  const code = block?.querySelector('code');
  return code ? '```javascript\n' + decode(code.text).trimEnd() + '\n```' : '';
}

function renderMember(el, example, level = '###') {
  const kind = el.getAttribute('data-entity');
  const out = [`${level} ${memberName(el)}${kind === 'method' ? '()' : ''}`];

  const type = text(el.querySelector('[class^=property-type]'));
  if (type) out.push(`**Type:** \`${type}\``);

  const desc = md(
    el.querySelector('[class^=property-desc], [class^=method-desc]')?.innerHTML ?? '',
  );
  if (desc) out.push(desc);

  const args = renderArgs(el.querySelector('[class^=method-args]'));
  if (args) out.push(args);

  const ret = md(el.querySelector('[class^=method-return]')?.innerHTML ?? '');
  if (ret) out.push(`**Returns:** ${ret}`);

  const sample = renderExample(example);
  if (sample) out.push(sample);

  return out.join('\n\n');
}

/** The whole constants list is one article of flat property items. */
function renderConstants(article) {
  const simple = [];
  const groups = [];
  for (const item of article.querySelectorAll('[data-index-ref]')) {
    const kind = item.getAttribute('data-entity');
    if (kind === 'property' && !item.getAttribute('data-entity-parent')) {
      simple.push([memberName(item), text(item.querySelector('[class^=property-type]'))]);
    } else if (kind === 'entity') {
      const name = memberName(item);
      const rows = item
        .querySelectorAll('[data-entity=property]')
        .map(p => [memberName(p), text(p.querySelector('[class^=property-type]'))]);
      groups.push([name, rows]);
    }
  }
  const table = rows =>
    [
      '| constant | value |',
      '| --- | --- |',
      ...rows.map(([n, v]) => `| \`${n}\` | \`${v}\` |`),
    ].join('\n');
  return [
    '# Constants',
    'Import from `game/constants`.',
    table(simple),
    ...groups.flatMap(([name, rows]) => [`## ${name}`, table(rows)]),
  ].join('\n\n');
}

const pages = [];

for (const article of root.querySelectorAll('main article')) {
  if (article.querySelector('#Constants')) {
    pages.push({
      name: 'Constants',
      section: 'Constants',
      file: 'Constants.md',
      content: renderConstants(article),
    });
    continue;
  }

  const blocks = article.childNodes.filter(n => n.nodeType === 1);
  const head = article.querySelector('[data-entity=entity]');

  let name, content;
  if (head) {
    name = memberName(head);
    const kind = text(head.querySelector('header h3 > div')).replace(/\s+/g, ' ');
    const module = head.querySelector('button[title]')?.getAttribute('title');
    const desc = md(head.querySelector('[data-entity-desc]')?.innerHTML ?? '');
    const body = [];
    for (const block of blocks) {
      const member = block.getAttribute?.('data-entity')
        ? block
        : block.querySelector?.('[data-entity=property], [data-entity=method]');
      if (!member || member === head) continue;
      body.push(renderMember(member, block.querySelector?.('[data-entity-code]') ?? null));
    }
    content = [
      `# ${name}`,
      kind ? `\`${kind}\`` : '',
      module ? `Import from \`${module}\`.` : '',
      desc,
      ...body,
    ]
      .filter(Boolean)
      .join('\n\n');
  } else {
    // Global functions are root-level method blocks with no owning entity.
    const member =
      blocks.find(b => b.getAttribute?.('data-entity')) ??
      article.querySelector('[data-entity=method]');
    if (!member) continue;
    name = member.getAttribute('data-index-ref');
    const module = member.querySelector('button[title]')?.getAttribute('title');
    const body = renderMember(member, article.querySelector('[data-entity-code]'), '#');
    const [heading, ...rest] = body.split('\n\n');
    content = [heading, module ? `Import from \`${module}\`.` : '', ...rest]
      .filter(Boolean)
      .join('\n\n');
  }
  if (!name) continue;
  pages.push({ name, section: sectionOf.get(name) ?? 'Reference', file: fileFor(name), content });
}

// Resolve cross-reference placeholders now that the page set is known.
const known = new Set(pages.map(p => p.file));
const resolve = s =>
  s.replace(/@@([^|@]*)\|([^@]*)@@/g, (_m, owner, label) =>
    known.has(fileFor(owner)) ? `[${label}](${fileFor(owner)})` : `\`${label}\``,
  );

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const page of pages) writeFileSync(path.join(outDir, page.file), resolve(page.content) + '\n');

const bySection = new Map();
for (const page of pages) {
  if (!bySection.has(page.section)) bySection.set(page.section, []);
  bySection.get(page.section).push(page);
}

writeFileSync(
  path.join(outDir, 'index.md'),
  [
    '# Screeps Arena API reference',
    '',
    `Generated from the docs shipped with the game client (docs version \`${version}\`).`,
    'Regenerate with `bin/arena sync-docs`. Do not edit these files by hand.',
    '',
    ...[...bySection].flatMap(([title, entries]) => [
      `## ${title}`,
      '',
      ...entries.map(e => `- [${e.name}](${e.file})`),
      '',
    ]),
  ].join('\n'),
);

console.log(`wrote ${pages.length} pages to ${outDir} (docs version ${version})`);
for (const [title, entries] of bySection) console.log(`  ${title}: ${entries.length}`);
