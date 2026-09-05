#!/usr/bin/env node
/*
 * Converts source screenshots into the WebP variants the page ships.
 *
 *   npm install            # once, pulls in sharp
 *   npm run images         # convert everything in assets/screenshots
 *
 * Drop the raw PNG/JPEG exports into assets/screenshots as <slug>-<n>.<ext>,
 * run this, then delete the sources (.gitignore already excludes them).
 *
 * Two things this does on purpose:
 *   - three widths, so <img srcset> can hand phones and desktops the right one
 *   - no .withMetadata(), so EXIF (device model, build number, capture time)
 *     is dropped instead of being published with the screenshot
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets/screenshots');
const WIDTHS = [320, 720, 1080];
const QUALITY = 74;

const sources = fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f));
if (sources.length === 0) {
    console.log('No source images in assets/screenshots — nothing to do.');
    process.exit(0);
}

let total = 0;
for (const file of sources) {
    const slug = path.basename(file).replace(/\.[^.]+$/, '');
    for (const width of WIDTHS) {
        const dest = path.join(dir, `${slug}-${width}.webp`);
        const info = await sharp(path.join(dir, file))
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: QUALITY, effort: 6 })
            .toFile(dest);
        total += info.size;
        console.log(`${path.basename(dest)}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
    }
}
console.log(`\n${sources.length} source image(s) → ${sources.length * WIDTHS.length} WebP files, ${(total / 1024 / 1024).toFixed(2)} MB total.`);
console.log('Remember to update the width/height values in data/apps.json if the aspect ratio changed.');
