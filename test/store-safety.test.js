import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';

const fresh = () => mkdtempSync(join(tmpdir(), 'saathi-store-'));

test('store: a fresh folder starts empty, saves, and reads the same data back after a restart', () => {
  const dir = fresh();
  try {
    const a = new Store(dir);
    a.putUser('u1', { lang: 'en', wallet: { paise: 500 } });
    a.setSetting('motd', 'hello');
    const b = new Store(dir);
    assert.equal(b.getUser('u1').wallet.paise, 500);
    assert.equal(b.getSetting('motd'), 'hello');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: a corrupt data file stops the app from starting and is left exactly as it was', () => {
  const dir = fresh();
  try {
    const bad = '{"u1": {"wallet": {"paise": 500}'; // truncated JSON
    writeFileSync(join(dir, 'users.json'), bad);
    assert.throws(() => new Store(dir), /cannot be read.*Refusing to start/s);
    assert.equal(readFileSync(join(dir, 'users.json'), 'utf8'), bad, 'the broken file must not be overwritten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: a data folder that cannot be written stops the app from starting', () => {
  const dir = fresh();
  try {
    const notAFolder = join(dir, 'file-not-folder');
    writeFileSync(notAFolder, 'x');
    assert.throws(() => new Store(notAFolder));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: the daily backup copies every file once a day and drops copies older than 14 days', () => {
  const dir = fresh();
  try {
    const s = new Store(dir);
    s.putUser('u1', { lang: 'en' });
    s.setSetting('motd', 'hi');
    const now = Date.parse('2026-10-10T12:00:00Z');
    mkdirSync(join(dir, 'backups', '2026-09-01'), { recursive: true }); // 39 days old: removed
    mkdirSync(join(dir, 'backups', '2026-09-28'), { recursive: true }); // 12 days old: kept
    mkdirSync(join(dir, 'backups', 'not-a-date'), { recursive: true }); // not ours: left alone

    assert.equal(s.backupIfDue(now), '2026-10-10');
    assert.equal(s.backupIfDue(now), null, 'a second run the same day does nothing');
    assert.ok(existsSync(join(dir, 'backups', '2026-10-10', 'users.json')));
    assert.ok(existsSync(join(dir, 'backups', '2026-10-10', 'settings.json')));
    assert.equal(existsSync(join(dir, 'backups', '2026-09-01')), false, 'older than 14 days is removed');
    assert.ok(existsSync(join(dir, 'backups', '2026-09-28')), 'within 14 days is kept');
    assert.ok(existsSync(join(dir, 'backups', 'not-a-date')), 'folders that are not dated backups are not touched');

    const copy = JSON.parse(readFileSync(join(dir, 'backups', '2026-10-10', 'users.json'), 'utf8'));
    assert.equal(copy.u1.lang, 'en');
    assert.deepEqual(readdirSync(join(dir, 'backups', '2026-10-10')).sort().includes('users.json'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: reports whether the data folder is its own disk', () => {
  const dir = fresh();
  try {
    const info = new Store(dir).storageInfo();
    assert.equal(info.dir, dir);
    assert.equal(typeof info.separateDisk === 'boolean' || info.separateDisk === null, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
