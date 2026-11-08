import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReminder, dueNotices } from '../src/reminders.js';

test('reminder alerts: only the chosen notices go out', () => {
  const now = Date.parse('2027-03-01T06:00:00Z'); // 11:30 in India on 1 March
  const u = { reminders: [makeReminder({ id: 'x', type: 'custom', label: 'PAN', due: '2027-03-21', alerts: [7] }, now)] };
  assert.deepEqual(dueNotices(u, now), []); // 20 days out: the 7-day alert is not due yet
  assert.deepEqual(dueNotices(u, Date.parse('2027-03-14T06:00:00Z')).map((n) => n.milestone), [7]);
  assert.deepEqual(dueNotices(u, Date.parse('2027-03-21T06:00:00Z')), []); // the on-the-day alert is off
});

test('reminder alerts: all three by default, and no field stored for the default', () => {
  const r = makeReminder({ id: 'y', type: 'custom', label: 'Renewal', due: '2027-06-01' }, Date.parse('2027-03-01T06:00:00Z'));
  assert.equal(r.alerts, undefined);
  assert.equal(r.sent[0], false);
});

