#!/usr/bin/env node
/*
 * Generates index.html from data/apps.json + tools/template.html, and the
 * app sections of README.md (between <!-- name:start --> / <!-- name:end -->).
 *
 *   node tools/build.mjs           # write index.html and README.md
 *   node tools/build.mjs --check   # fail if either is out of date (CI)
 *
 * Both modes first validate the data and lint the CSS custom properties, so
 * a typo fails the build with a message instead of shipping silently.
 *
 * The generated page is fully static: no client-side rendering, so it works
 * with JavaScript disabled and needs no runtime dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const data = JSON.parse(read('data/apps.json'));
const template = read('tools/template.html');
const styles = read('assets/styles.css');

/* ---------- Checks ---------- */

const errors = [];

function validate() {
    const iconClasses = new Set([...styles.matchAll(/\.app-icon\.([\w-]+)/g)].map(m => m[1]));
    const categories = new Set(data.categories.map(c => c.id));
    const hex64 = /^[0-9a-f]{64}$/;
    const isText = v => typeof v === 'string' && v.trim() !== '';
    const isList = v => Array.isArray(v) && v.length > 0;

    if (!hex64.test(data.signer ?? '')) errors.push('signer: expected 64 lowercase hex characters (npm run apk-info)');

    const ids = new Set();
    data.apps.forEach((app, i) => {
        const at = `apps[${i}]${app.id ? ` (${app.id})` : ''}`;
        const need = (ok, msg) => { if (!ok) errors.push(`${at}: ${msg}`); };

        for (const key of ['id', 'name', 'version', 'icon', 'tagline', 'description']) {
            need(isText(app[key]), `"${key}" is missing or empty`);
        }
        need(/^[a-z0-9-]+$/.test(app.id ?? ''), '"id" must be lowercase letters, digits and dashes');
        need(!ids.has(app.id), '"id" is used twice');
        ids.add(app.id);
        need(categories.has(app.category) && app.category !== 'all',
            `"category" must be one of: ${[...categories].filter(c => c !== 'all').join(', ')}`);
        need(iconClasses.has(app.iconClass),
            `"iconClass" must be one defined in assets/styles.css: ${[...iconClasses].join(', ')}`);
        need(isList(app.tags), '"tags" must be a non-empty list');
        need(/^https:\/\//.test(app.download?.url ?? ''), '"download.url" must start with https://');
        need(isText(app.download?.size), '"download.size" is missing');
        need(hex64.test(app.download?.sha256 ?? ''), '"download.sha256" must be 64 lowercase hex characters (npm run apk-info)');
        need(isList(app.shots), '"shots" must be a non-empty list');
        (app.shots ?? []).forEach((s, j) => {
            need(isText(s.base) && isText(s.alt), `shots[${j}] needs "base" and "alt"`);
            need(Number.isInteger(s.width) && Number.isInteger(s.height), `shots[${j}] needs integer "width" and "height"`);
            if (isText(s.base)) {
                for (const w of [320, 720, 1080]) {
                    need(fs.existsSync(path.join(root, `assets/screenshots/${s.base}-${w}.webp`)),
                        `assets/screenshots/${s.base}-${w}.webp does not exist (npm run images)`);
                }
            }
        });
        need(isList(app.features), '"features" must be a non-empty list');
        (app.features ?? []).forEach((f, j) => {
            need(isText(f.icon) && isText(f.title) && isText(f.text), `features[${j}] needs "icon", "title" and "text"`);
        });
    });
}

/* A custom property used but never defined, or defined in terms of itself,
   resolves to nothing and silently drops every declaration that uses it.
   That is how the font and all the surface colours once vanished. */
function lintCustomProperties() {
    const defined = new Map();
    for (const m of styles.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) defined.set(m[1], m[2]);
    for (const [name, value] of defined) {
        if (new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value)) {
            errors.push(`assets/styles.css: ${name} is defined in terms of itself`);
        }
    }
    const used = new Set([...styles.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]));
    for (const name of used) {
        if (!defined.has(name)) errors.push(`assets/styles.css: ${name} is used but never defined`);
    }
}

validate();
lintCustomProperties();
if (errors.length) {
    console.error(`Build stopped, ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
}

/* ---------- Page ---------- */

/** Escape text destined for element content or a double-quoted attribute. */
const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const indent = (block, spaces) =>
    block.split('\n').map(l => (l ? ' '.repeat(spaces) + l : l)).join('\n');

const DOWNLOAD_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
</svg>`;

function shot(s) {
    const src = n => `assets/screenshots/${esc(s.base)}-${n}.webp`;
    return `<button type="button" class="screenshot" aria-label="تكبير ${esc(s.alt)}">
    <img src="${src(320)}"
         srcset="${src(320)} 320w, ${src(720)} 720w"
         sizes="(max-width: 400px) 60vw, (max-width: 900px) 240px, 140px"
         alt="${esc(s.alt)}" width="${s.width}" height="${s.height}" loading="lazy" decoding="async">
</button>`;
}

function feature(f) {
    return `<div class="feature-item">
    <div class="feature-icon" aria-hidden="true">${esc(f.icon)}</div>
    <div class="feature-content">
        <h4>${esc(f.title)}</h4>
        <p>${esc(f.text)}</p>
    </div>
</div>`;
}

function card(app) {
    const meta = [`الحجم: ${esc(app.download.size)}`, 'يفتح في Google Drive'];
    return `<article class="app-card" id="${esc(app.id)}" data-app="${esc(app.id)}" data-category="${esc(app.category)}">
    <div class="app-card-inner">
        <div class="app-info">
            <div class="app-header">
                <div class="app-icon ${esc(app.iconClass)}" aria-hidden="true">${esc(app.icon)}</div>
                <div class="app-title-wrap">
                    <h3>${esc(app.name)}</h3>
                    <span class="app-version">الإصدار ${esc(app.version)}</span>
                </div>
            </div>
            <p class="app-tagline">${esc(app.tagline)}</p>
            <div class="app-features">
${indent(app.tags.map(t => `<span class="feature-tag">${esc(t)}</span>`).join('\n'), 16)}
            </div>
            <p class="app-description">${esc(app.description)}</p>
            <div class="app-actions">
                <a href="${esc(app.download.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
${indent(DOWNLOAD_ICON, 20)}
                    تحميل APK
                </a>
                <button type="button" class="btn btn-secondary btn-details" aria-expanded="true" aria-controls="features-${esc(app.id)}" hidden>
                    <span class="btn-details-text">إخفاء التفاصيل</span>
                    <span class="btn-details-arrow" aria-hidden="true">▾</span>
                </button>
            </div>
            <p class="download-meta">${meta.join('<span class="meta-sep" aria-hidden="true">·</span>')}</p>
            <details class="verify">
                <summary>التحقق من الملف قبل التثبيت</summary>
                <dl>
                    <dt>SHA-256 للملف</dt>
                    <dd><code dir="ltr">${esc(app.download.sha256)}</code></dd>
                    <dt>بصمة شهادة التوقيع (SHA-256)</dt>
                    <dd><code dir="ltr">${esc(data.signer)}</code></dd>
                </dl>
            </details>
        </div>
        <div class="app-screenshots">
${indent(app.shots.map(shot).join('\n'), 12)}
        </div>
    </div>
    <div class="features-list" id="features-${esc(app.id)}">
        <div class="features-grid">
${indent(app.features.map(feature).join('\n'), 12)}
        </div>
    </div>
</article>`;
}

const filters = `<div class="filters" role="group" aria-label="تصفية التطبيقات حسب التصنيف" hidden>
${indent(data.categories.map(c =>
    `<button type="button" class="filter-chip" data-category="${esc(c.id)}" aria-pressed="${c.id === 'all'}">${esc(c.label)}</button>`
).join('\n'), 4)}
</div>`;

/* Replacement callbacks, not strings: a string replacement treats $& and
   $' in the data as patterns and splices the template back into the page. */
const html = template
    .replace('<!--{{FILTERS}}-->', () => indent(filters, 12).trimStart())
    .replace('<!--{{CARDS}}-->', () => indent(data.apps.map(card).join('\n\n'), 16).trimStart())
    .replace(/\{\{APP_COUNT\}\}/g, () => String(data.apps.length));

/* ---------- README ---------- */

const mdCell = s => String(s).replace(/\|/g, '\\|');

function readmeApp(app) {
    return `### ${app.icon} ${app.name}
> ${app.tagline}

| المعلومات | التفاصيل |
|-----------|----------|
| 📌 الإصدار | ${mdCell(app.version)} |
| 📦 الحجم | ${mdCell(app.download.size)} |
| 🏷️ الوسوم | ${app.tags.map(mdCell).join('، ')} |

**المميزات:**
${app.features.map(f => `- ${f.icon} **${f.title}:** ${f.text}`).join('\n')}`;
}

const readmeTable = `| التطبيق | الوصف | الإصدار | الحجم |
|---------|-------|---------|-------|
${data.apps.map(a => `| ${a.icon} ${mdCell(a.name)} | ${mdCell(a.tagline)} | ${mdCell(a.version)} | ${mdCell(a.download.size)} |`).join('\n')}`;

function fillRegion(text, name, content) {
    const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
    if (!re.test(text)) {
        console.error(`README.md has no <!-- ${name}:start --> / <!-- ${name}:end --> markers.`);
        process.exit(1);
    }
    return text.replace(re, (_, open, close) => `${open}${content}${close}`);
}

let readme = read('README.md');
readme = fillRegion(readme, 'count', String(data.apps.length));
readme = fillRegion(readme, 'apps', `\n${data.apps.map(readmeApp).join('\n\n---\n\n')}\n`);
readme = fillRegion(readme, 'table', `\n${readmeTable}\n`);

/* ---------- Output ---------- */

const outputs = [['index.html', html], ['README.md', readme]];

if (process.argv.includes('--check')) {
    const stale = outputs.filter(([file, content]) => {
        const p = path.join(root, file);
        return (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '') !== content;
    });
    if (stale.length) {
        console.error(`${stale.map(([f]) => f).join(' and ')} out of date. Run: node tools/build.mjs`);
        process.exit(1);
    }
    console.log('index.html and README.md are up to date.');
} else {
    for (const [file, content] of outputs) fs.writeFileSync(path.join(root, file), content);
    console.log(`index.html and README.md written (${data.apps.length} apps).`);
}
