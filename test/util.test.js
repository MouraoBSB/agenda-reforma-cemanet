import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timestampDiaUTC, paragrafo } from '../src/util.js';

test('timestampDiaUTC retorna meia-noite UTC em segundos', () => {
  // valores validados contra o post real de maio (31/05/2026 = 1780185600)
  assert.equal(timestampDiaUTC(2026, 5, 31), 1780185600);
  assert.equal(timestampDiaUTC(2026, 6, 1), 1780272000);
  assert.equal(timestampDiaUTC(2026, 6, 30), 1782777600);
});

test('timestampDiaUTC retorna inteiro', () => {
  assert.ok(Number.isInteger(timestampDiaUTC(2026, 6, 15)));
});

test('paragrafo envolve o texto em <p>', () => {
  assert.equal(paragrafo('Olá'), '<p>Olá</p>');
});

test('paragrafo preserva acentos e aspas tipográficas', () => {
  assert.equal(paragrafo('"coração"'), '<p>"coração"</p>');
});
