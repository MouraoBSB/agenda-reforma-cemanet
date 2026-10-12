import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRegistro, validarMes, validarDocumento } from '../src/montarPayload.js';

const MES_JUNHO = { ano: 2026, mes: 6, mesNome: 'Junho', metaMesTitulo: 'Combater o egoísmo: indiferença e ingratidão' };

const registroValido = {
  dia: 1,
  reflexao: '"Se alguém te bater numa face..." (Lucas, 6: 29).',
  metaMesTexto: '"Oh! meus amigos..." (Allan Kardec, item 13).',
  tituloMetaDia: 'Combater a Indiferença',
  metaDia: 'Enternecer-se ante o sofrimento do próximo.',
  prece: 'Prece em favor dos desesperados e cansados do caminho.'
};

test('validarRegistro não acusa erros em registro completo', () => {
  assert.deepEqual(validarRegistro(registroValido), []);
  assert.deepEqual(validarRegistro({ ...registroValido, dia: 31 }), []);
});

test('validarRegistro acusa campos vazios e dia inválido', () => {
  const erros = validarRegistro({ ...registroValido, dia: 0, reflexao: '', prece: '   ' });
  assert.ok(erros.some((e) => e.includes('dia inválido')));
  assert.ok(erros.some((e) => e.includes('"reflexao" vazio')));
  assert.ok(erros.some((e) => e.includes('"prece" vazio')));
});

test('validarRegistro recusa chave desconhecida', () => {
  for (const chave of ['status', 'id', 'wp_id', 'data']) {
    assert.ok(validarRegistro({ ...registroValido, [chave]: 'x' }).some((e) => e.includes(`"${chave}" não aceito`)));
  }
});

test('validarRegistro recusa quebra de linha, caractere de controle e endereço de site', () => {
  assert.ok(validarRegistro({ ...registroValido, prece: 'linha um\nlinha dois' }).some((e) => e.includes('quebra de linha')));
  assert.ok(validarRegistro({ ...registroValido, metaDia: 'tab\taqui' }).some((e) => e.includes('caractere de controle')));
  assert.ok(validarRegistro({ ...registroValido, reflexao: 'veja https://exemplo.org' }).some((e) => e.includes('://')));
});

test('validarRegistro aplica os limites de tamanho por campo', () => {
  const limites = { reflexao: 2000, metaMesTexto: 2000, metaDia: 1000, prece: 1000, tituloMetaDia: 255 };
  for (const [campo, limite] of Object.entries(limites)) {
    assert.deepEqual(validarRegistro({ ...registroValido, [campo]: 'ç'.repeat(limite) }), []);
    const erros = validarRegistro({ ...registroValido, [campo]: 'ç'.repeat(limite + 1) });
    assert.ok(erros.some((e) => e.includes(`passa de ${limite} caracteres`)), campo);
  }
});

test('validarMes aceita mês válido e acusa metadados errados', () => {
  assert.deepEqual(validarMes(MES_JUNHO), []);
  assert.ok(validarMes({ ano: 2026, mes: 6, mesNome: 'Junho' }).some((e) => e.includes('metaMesTitulo')));
  assert.ok(validarMes({ ...MES_JUNHO, mes: 13 }).some((e) => e.includes('"mes"')));
  assert.ok(validarMes({ ...MES_JUNHO, ano: 1999 }).some((e) => e.includes('"ano"')));
  assert.ok(validarMes({ ...MES_JUNHO, mesNome: 'Julho' }).some((e) => e.includes('deveria ser "Junho"')));
  assert.ok(validarMes({ ...MES_JUNHO, metaMesTitulo: 'x'.repeat(256) }).some((e) => e.includes('255')));
  assert.ok(validarMes({ ...MES_JUNHO, extra: 1 }).some((e) => e.includes('"extra" não aceito')));
});

test('validarDocumento aceita mês completo', () => {
  assert.deepEqual(validarDocumento({ ...MES_JUNHO, dias: [registroValido, { ...registroValido, dia: 2 }] }), []);
});

test('validarDocumento coleta dia repetido, data inexistente e erros por dia', () => {
  const erros = validarDocumento({
    ...MES_JUNHO,
    dias: [registroValido, registroValido, { ...registroValido, dia: 31 }, { ...registroValido, dia: 5, prece: '' }]
  });
  assert.ok(erros.some((e) => e === 'dia 1: dia repetido'));
  assert.ok(erros.some((e) => e.includes('dia 31: a data 31/6/2026 não existe')));
  assert.ok(erros.some((e) => e.includes('dia 5: campo "prece" vazio')));
});

test('validarDocumento exige de 1 a 31 dias', () => {
  assert.ok(validarDocumento({ ...MES_JUNHO, dias: [] }).some((e) => e.includes('1 a 31')));
  assert.ok(validarDocumento({ ...MES_JUNHO }).some((e) => e.includes('1 a 31')));
});
