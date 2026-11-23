// Ausführen mit:  node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointUrl, originPattern, parseOrder, callService } from '../chrome-extension/lib/vertec.js';

test('endpointUrl: Format laut Vertec KB', () => {
  assert.equal(endpointUrl('https://firma.vertec-cloud.ch/', 'peoplefone', 'auftrag'),
    'https://firma.vertec-cloud.ch/api/webservice/peoplefone/auftrag');
});

test('originPattern', () => {
  assert.equal(originPattern('https://firma.vertec-cloud.ch/irgendwas'), 'https://firma.vertec-cloud.ch/*');
  assert.equal(originPattern('kein url'), null);
  assert.equal(originPattern('ftp://x'), null);
});

test('parseOrder', () => {
  assert.deepEqual(parseOrder({ id: 'a1', tel: '+41311234567', alter: 3 }), { id: 'a1', tel: '+41311234567' });
  assert.equal(parseOrder({ id: null }), null);
  assert.equal(parseOrder(null), null);
  assert.equal(parseOrder({ id: 5, tel: '+41' }), null);
});

test('callService: sendet Token und Code, meldet Fehler verständlich', async () => {
  let seen;
  const okFetch = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ ok: true }) }; };
  const s = { vertecUrl: 'https://v.example', webserviceName: 'peoplefone', apiToken: 'T', pairingCode: '1-x' };
  assert.deepEqual(await callService(s, 'ping', okFetch), { ok: true });
  assert.equal(seen.url, 'https://v.example/api/webservice/peoplefone/ping');
  assert.equal(seen.opts.headers.Authorization, 'Bearer T');
  assert.equal(seen.opts.headers['X-Peoplefone-Code'], '1-x');
  const err403 = async () => ({ ok: false, status: 403 });
  await assert.rejects(callService(s, 'ping', err403), /Kopplungscode/);
});
