#!/usr/bin/env node
/*
 * Prints the values data/apps.json needs to let users verify a download.
 *
 *   npm run apk-info -- path/to/app.apk [more.apk ...]
 *
 *   sha256  — hash of the APK file itself (changes with every build)
 *   signer  — SHA-256 of the signing certificate, the same value
 *             `apksigner verify --print-certs` reports. It stays fixed across
 *             releases, so a mismatch means someone else built the file.
 *
 * Reads the APK Signature Scheme v2/v3 block, falling back to the v1
 * META-INF certificate, so it needs no Android SDK.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const V2_ID = 0x7109871a;
const V3_ID = 0xf05368c0;
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** Splits a sequence of uint32-length-prefixed values. */
function lengthPrefixed(buf) {
    const items = [];
    for (let off = 0; off < buf.length;) {
        const len = buf.readUInt32LE(off);
        items.push(buf.subarray(off + 4, off + 4 + len));
        off += 4 + len;
    }
    return items;
}

function centralDirOffset(apk) {
    // End of central directory: fixed 22 bytes plus an optional comment.
    for (let i = apk.length - 22; i >= Math.max(0, apk.length - 22 - 0xffff); i--) {
        if (apk.readUInt32LE(i) === 0x06054b50) return apk.readUInt32LE(i + 16);
    }
    throw new Error('not a zip file');
}

function signerFromSigningBlock(apk) {
    const cd = centralDirOffset(apk);
    if (apk.toString('latin1', cd - 16, cd) !== 'APK Sig Block 42') return null;
    const size = Number(apk.readBigUInt64LE(cd - 24));
    const start = cd - size - 8;
    const pairs = apk.subarray(start + 8, cd - 24);

    const blocks = new Map();
    for (let off = 0; off < pairs.length;) {
        const len = Number(pairs.readBigUInt64LE(off));
        blocks.set(pairs.readUInt32LE(off + 8), pairs.subarray(off + 12, off + 8 + len));
        off += 8 + len;
    }
    const block = blocks.get(V3_ID) || blocks.get(V2_ID);
    if (!block) return null;

    // block → signers → signer → signed data → [digests, certificates, ...]
    const signer = lengthPrefixed(lengthPrefixed(block)[0])[0];
    const signedData = lengthPrefixed(signer)[0];
    const certs = lengthPrefixed(lengthPrefixed(signedData)[1]);
    return sha256(certs[0]);
}

function signerFromV1(file) {
    // A v1-only APK keeps a PKCS#7 blob in META-INF; openssl pulls the cert out.
    const list = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
    const entry = list.split('\n').find(n => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(n));
    if (!entry) return null;
    const pkcs7 = execFileSync('unzip', ['-p', file, entry]);
    const pem = execFileSync('openssl', ['pkcs7', '-inform', 'DER', '-print_certs'], { input: pkcs7 });
    const der = execFileSync('openssl', ['x509', '-outform', 'DER'], { input: pem });
    return sha256(der);
}

const files = process.argv.slice(2);
if (files.length === 0) {
    console.error('Usage: npm run apk-info -- path/to/app.apk [...]');
    process.exit(1);
}

let failed = false;
for (const file of files) {
    try {
        const apk = fs.readFileSync(file);
        const signer = signerFromSigningBlock(apk) ?? signerFromV1(file);
        console.log(`${file}\n  "sha256": "${sha256(apk)}",\n  "signer": "${signer ?? 'no signature found'}"\n`);
    } catch (err) {
        // A Drive "virus scan warning" page saved as .apk lands here.
        console.error(`${file}: ${err.message} — is this really an APK?\n`);
        failed = true;
    }
}
process.exitCode = failed ? 1 : 0;
