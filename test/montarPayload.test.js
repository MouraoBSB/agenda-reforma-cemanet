import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPayload, validarRegistro } from '../src/montarPayload.js';

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
});

test('validarRegistro acusa campos vazios e dia inválido', () => {
  const erros = validarRegistro({ dia: 0, reflexao: '', metaMesTexto: 'x', tituloMetaDia: 'x', metaDia: 'x', prece: '' });
  assert.ok(erros.some(e => e.includes('dia')));
  assert.ok(erros.some(e => e.includes('reflexao')));
  assert.ok(erros.some(e => e.includes('prece')));
});

test('montarPayload gera title, status e date corretos', () => {
  const p = montarPayload(registroValido);
  assert.equal(p.title, '01 de Junho de 2026');
  assert.equal(p.status, 'future');
  assert.equal(p.date, '2026-06-01T00:00:00');
});

test('montarPayload preenche meta com formatos do JetEngine', () => {
  const p = montarPayload(registroValido);
  assert.equal(p.meta._dia_agenda, 1780272000);
  assert.equal(p.meta._reflexao, '<p>"Se alguém te bater numa face..." (Lucas, 6: 29).</p>');
  assert.equal(p.meta.possui_meta_mes, 'true');
  assert.equal(p.meta._mes_titulo, 'Combater o egoísmo: indiferença e ingratidão');
  assert.equal(p.meta._mes_texto, '<p>"Oh! meus amigos..." (Allan Kardec, item 13).</p>');
  assert.equal(p.meta.possui_meta_dia, 'true');
  assert.equal(p.meta._titulo_meta_dia, 'Combater a Indiferença');
  assert.equal(p.meta._dia, '<p>Enternecer-se ante o sofrimento do próximo.</p>');
  assert.equal(p.meta._prece, '<p>Prece em favor dos desesperados e cansados do caminho.</p>');
  assert.equal(p.meta.possui_imagem, 'false');
  assert.equal(p.meta.possui_tema, 'false');
  assert.equal(p.meta._imagem, '');
  assert.equal(p.meta._texto_imagem, '');
  assert.equal(p.meta._tema, '');
});

test('montarPayload formata o dia 30 com timestamp correto', () => {
  const p = montarPayload({ ...registroValido, dia: 30 });
  assert.equal(p.title, '30 de Junho de 2026');
  assert.equal(p.date, '2026-06-30T00:00:00');
  assert.equal(p.meta._dia_agenda, 1782777600);
});
