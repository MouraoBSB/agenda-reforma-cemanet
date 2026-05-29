import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validarRegistro } from '../src/montarPayload.js';

const PASTA_DADOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'dados');
const arquivos = readdirSync(PASTA_DADOS).filter((f) => f.endsWith('.json'));

for (const arquivo of arquivos) {
  const caminho = join(PASTA_DADOS, arquivo);
  const dados = JSON.parse(readFileSync(caminho, 'utf8'));

  test(`${arquivo}: possui metadados do mês (ano, mes, mesNome, metaMesTitulo, dias)`, () => {
    assert.ok(Number.isInteger(dados.ano), 'ano deve ser inteiro');
    assert.ok(Number.isInteger(dados.mes) && dados.mes >= 1 && dados.mes <= 12, 'mes deve ser inteiro de 1 a 12');
    assert.ok(typeof dados.mesNome === 'string' && dados.mesNome.trim(), 'mesNome não pode ser vazio');
    assert.ok(typeof dados.metaMesTitulo === 'string' && dados.metaMesTitulo.trim(), 'metaMesTitulo não pode ser vazio');
    assert.ok(Array.isArray(dados.dias), 'dias deve ser array');
  });

  test(`${arquivo}: dias formam sequência 1..N sem repetição`, () => {
    const N = dados.dias.length;
    const diasOrdenados = dados.dias.map((d) => d.dia).sort((a, b) => a - b);
    assert.deepEqual(diasOrdenados, Array.from({ length: N }, (_, i) => i + 1));
  });

  test(`${arquivo}: todos os registros são válidos (campos obrigatórios preenchidos)`, () => {
    for (const r of dados.dias) {
      assert.deepEqual(validarRegistro(r), [], `dia ${r.dia} inválido`);
    }
  });

  test(`${arquivo}: títulos do dia estão em caixa normal (não tudo maiúsculo)`, () => {
    for (const r of dados.dias) {
      assert.notEqual(r.tituloMetaDia, r.tituloMetaDia.toUpperCase(), `dia ${r.dia} em caixa alta`);
    }
  });

  test(`${arquivo}: campos não contêm HTML/CSS residual`, () => {
    for (const r of dados.dias) {
      for (const campo of ['reflexao', 'metaMesTexto', 'metaDia', 'prece']) {
        assert.ok(!/<\/?(p|section|div|span)\b/i.test(r[campo]), `dia ${r.dia} campo ${campo} contém HTML`);
      }
    }
  });
}
