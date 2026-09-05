#!/usr/bin/env node
/*
 * Generates index.html from data/apps.json + tools/template.html.
 *
 *   node tools/build.mjs           # write index.html
 *   node tools/build.mjs --check   # fail if index.html is out of date (CI)
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
         sizes="(max-width: 900px) min(60vw, 240px), 140px"
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

const html = template
    .replace('<!--{{FILTERS}}-->', indent(filters, 12).trimStart())
    .replace('<!--{{CARDS}}-->', indent(data.apps.map(card).join('\n\n'), 16).trimStart())
    .replace(/\{\{APP_COUNT\}\}/g, String(data.apps.length));

const outPath = path.join(root, 'index.html');

if (process.argv.includes('--check')) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (current !== html) {
        console.error('index.html is out of date. Run: node tools/build.mjs');
        process.exit(1);
    }
    console.log('index.html is up to date.');
} else {
    fs.writeFileSync(outPath, html);
    console.log(`index.html written (${data.apps.length} apps).`);
}
