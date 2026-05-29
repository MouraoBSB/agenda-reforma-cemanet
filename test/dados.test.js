import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validarRegistro } from '../src/montarPayload.js';

const dados = JSON.parse(await readFile(new URL('../dados/junho-2026.json', import.meta.url), 'utf8'));

test('contém exatamente 30 dias, de 1 a 30, sem repetição', () => {
  assert.equal(dados.length, 30);
  const dias = dados.map(d => d.dia).sort((a, b) => a - b);
  assert.deepEqual(dias, Array.from({ length: 30 }, (_, i) => i + 1));
});

test('todos os registros são válidos (campos obrigatórios preenchidos)', () => {
  for (const r of dados) {
    assert.deepEqual(validarRegistro(r), [], `dia ${r.dia} inválido`);
  }
});

test('títulos do dia estão em caixa normal (não tudo maiúsculo)', () => {
  for (const r of dados) {
    assert.notEqual(r.tituloMetaDia, r.tituloMetaDia.toUpperCase(), `dia ${r.dia} em caixa alta`);
  }
});

test('campos não contêm HTML/CSS residual', () => {
  for (const r of dados) {
    for (const campo of ['reflexao', 'metaMesTexto', 'metaDia', 'prece']) {
      assert.ok(!/<\/?(p|section|div|span)\b/i.test(r[campo]), `dia ${r.dia} campo ${campo} contém HTML`);
    }
  }
});
