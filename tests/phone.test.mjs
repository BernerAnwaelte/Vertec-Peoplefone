// Ausführen mit:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeNumber, isBlocked } from '../chrome-extension/lib/phone.js';

const vectors = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url)));

test('normalizeNumber: gemeinsame Testfälle', () => {
  for (const [input, expected] of vectors) {
    assert.equal(normalizeNumber(input, '41'), expected, `Eingabe: ${JSON.stringify(input)}`);
  }
});

test('normalizeNumber: andere Landesvorwahl', () => {
  assert.equal(normalizeNumber('030 1234567', '49'), '+49301234567');
});

test('isBlocked: Mehrwertnummern', () => {
  const blocked = ['+41900', '+41901', '+41906'];
  assert.equal(isBlocked('+41900123456', blocked), true);
  assert.equal(isBlocked(normalizeNumber('0906 123 456'), blocked), true);
  assert.equal(isBlocked('+41311234567', blocked), false);
  assert.equal(isBlocked(null, blocked), true);
});
