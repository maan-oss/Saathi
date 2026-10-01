import test from 'node:test';
import assert from 'node:assert/strict';
import { normDob, normField, normAll, missingKeys, ageYears, fromExtraction } from '../src/profile.js';

const NOW = Date.UTC(2026, 9, 1);

test('dates in the common Indian formats become DD/MM/YYYY; nonsense is rejected', () => {
  assert.equal(normDob('05/02/1990', NOW), '05/02/1990');
  assert.equal(normDob('5-2-1990', NOW), '05/02/1990');
  assert.equal(normDob('05.02.1990', NOW), '05/02/1990');
  assert.equal(normDob('1990-02-05', NOW), '05/02/1990'); // WhatsApp date picker
  assert.equal(normDob('5 Feb 1990', NOW), '05/02/1990');
  assert.equal(normDob('5th February 1990'.replace(/th/, ''), NOW), '05/02/1990');
  assert.equal(normDob('31/02/1990', NOW), null);
  assert.equal(normDob('05/02/2031', NOW), null); // future
  assert.equal(normDob('1990', NOW), null);
  assert.equal(normDob('', NOW), null);
});

test('age is computed from the birthday', () => {
  assert.equal(ageYears('01/10/2008', NOW), 18);
  assert.equal(ageYears('02/10/2008', NOW), 17);
});

test('names are tidied only when all caps or all lower; digits are refused', () => {
  assert.equal(normField('full_name', 'ASHA DEVI'), 'Asha Devi');
  assert.equal(normField('full_name', 'asha  devi'), 'Asha Devi');
  assert.equal(normField('full_name', "D'Souza Maria"), "D'Souza Maria");
  assert.equal(normField('full_name', 'Asha 2'), null);
  assert.equal(normField('full_name', 'A'), null);
});

test('PIN codes are 6 digits and cannot start with 0', () => {
  assert.equal(normField('pincode', '302 001'), '302001');
  assert.equal(normField('pincode', '02001'), null);
  assert.equal(normField('pincode', '3020011'), null);
});

test('gender, address and unknown fields', () => {
  assert.equal(normField('gender', 'F'), 'female');
  assert.equal(normField('gender', 'Male'), 'male');
  assert.equal(normField('gender', 'x'), null);
  assert.equal(normField('address', 'short'), null);
  assert.equal(normField('aadhaar_number', '123412341234'), null); // we never store ID numbers
});

test('normAll keeps good values, lists bad ones, and drops unknown keys such as ID numbers', () => {
  const { clean, bad } = normAll({ full_name: 'ASHA DEVI', dob: 'x', aadhaar: '1234 1234 1234', pincode: '302001' }, NOW);
  assert.deepEqual(clean, { full_name: 'Asha Devi', pincode: '302001' });
  assert.deepEqual(bad, ['dob']);
});

test('missingKeys and extraction mapping', () => {
  assert.deepEqual(missingKeys({ full_name: 'A B', dob: '01/01/1990' }, ['full_name', 'dob', 'father_name', 'gender', 'address', 'pincode']), ['father_name', 'gender', 'address', 'pincode']);
  assert.deepEqual(missingKeys({ full_name: 'A B' }, ['full_name', 'mobile']), ['mobile']);
  assert.equal(fromExtraction({ fields: { name: 'X Y' } }).full_name, 'X Y');
  assert.equal(fromExtraction({ name: 'X Y', dob: '01/01/1990' }).dob, '01/01/1990');
});
