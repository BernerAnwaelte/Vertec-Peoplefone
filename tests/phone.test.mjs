// Ausführen mit:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeNumber, isBlocked, parseDialUrl, buildDialUrl, safeEqual,
} from '../chrome-extension/lib/phone.js';

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

test('buildDialUrl / parseDialUrl: Hin- und Rückweg', () => {
  const url = buildDialUrl('https://softphone.peoplefone.com/', '+41311234567', 'ab&c=d');
  assert.equal(url, 'https://softphone.peoplefone.com/#vertec-dial=%2B41311234567&k=ab%26c%3Dd');
  const p = parseDialUrl(url);
  assert.equal(p.number, '+41311234567');
  assert.equal(p.token, 'ab&c=d');
});

test('parseDialUrl: unkodiertes "+" bleibt erhalten', () => {
  const p = parseDialUrl('https://softphone.peoplefone.com/#vertec-dial=+41311234567&k=x');
  assert.equal(p.number, '+41311234567');
});

test('parseDialUrl: ohne Wählparameter -> null', () => {
  assert.equal(parseDialUrl('https://softphone.peoplefone.com/'), null);
  assert.equal(parseDialUrl('https://softphone.peoplefone.com/#foo=1'), null);
  assert.equal(parseDialUrl('kein url'), null);
});

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), true);
});
