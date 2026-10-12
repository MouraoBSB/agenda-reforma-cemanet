import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig } from '../src/config.js';

const CHAVE_FALSA = 'chave-falsa-de-teste';

test('lê URL e chave do ambiente e monta a base da API', () => {
  const cfg = carregarConfig({ arquivoEnv: null, env: { CEMA_API_URL: 'https://x.org/', CEMA_API_CHAVE: ` ${CHAVE_FALSA} ` } });
  assert.equal(cfg.baseUrl, 'https://x.org/api/v1');
  assert.equal(cfg.chave, CHAVE_FALSA);
});

test('chave vazia ou ausente gera erro claro mandando preencher o .env', () => {
  for (const env of [{ CEMA_API_URL: 'https://x.org', CEMA_API_CHAVE: '' }, { CEMA_API_URL: 'https://x.org' }]) {
    assert.throws(() => carregarConfig({ arquivoEnv: null, env }), /CEMA_API_CHAVE vazia.*\.env/);
  }
});

test('URL ausente ou sem https é recusada sem mostrar a chave', () => {
  assert.throws(() => carregarConfig({ arquivoEnv: null, env: { CEMA_API_CHAVE: CHAVE_FALSA } }), /CEMA_API_URL ausente/);
  assert.throws(
    () => carregarConfig({ arquivoEnv: null, env: { CEMA_API_URL: 'http://x.org', CEMA_API_CHAVE: CHAVE_FALSA } }),
    (e) => /https/.test(e.message) && !e.message.includes(CHAVE_FALSA)
  );
});
