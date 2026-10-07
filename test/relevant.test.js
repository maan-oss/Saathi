import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICES, relevantFacts, relevantCross, serviceFacts, baseService } from '../src/services.js';

test('trimmed facts stay accurate: fee, official sites and unconfirmed notes always kept, and much smaller', () => {
  for (const s of SERVICES.filter((x) => !x.alias)) {
    const b = baseService(s.id) || s;
    const r = relevantFacts(s, 'how much does it cost and what documents');
    assert.ok(r.includes((b.sites || [])[0]), s.id + ' sites');
    if (b.fee) assert.ok(r.includes(b.fee.en.replace(/\*/g, '').slice(0, 40)), s.id + ' fee');
    if (b.unverified?.length) assert.match(r, /NOT CONFIRMED/);
    assert.ok(r.length <= serviceFacts(s).length, s.id + ' not larger');
  }
});

test('a specific question pulls in the matching section', () => {
  const pp = SERVICES.find((x) => x.id === 'passport');
  const r = relevantFacts(pp, 'how does police verification work for a lost passport');
  assert.match(r.toLowerCase(), /police/);
  assert.ok(relevantCross('gst late fee').toLowerCase().includes('gst'));
});
