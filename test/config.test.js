import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarConfig } from '../src/config.js';

test('carrega config válida e monta header Basic', async () => {
  const caminho = join(tmpdir(), `cfg-ok-${process.pid}.json`);
  await writeFile(caminho, JSON.stringify({ baseUrl: 'https://x.org/', usuario: 'u@x.org', senhaApp: 'a b c' }), 'utf8');
  const cfg = await carregarConfig(caminho);
  assert.equal(cfg.baseUrl, 'https://x.org'); // sem barra final
  assert.equal(cfg.authHeader, 'Basic ' + Buffer.from('u@x.org:a b c', 'utf8').toString('base64'));
  await rm(caminho);
});

test('falha quando falta campo obrigatório', async () => {
  const caminho = join(tmpdir(), `cfg-bad-${process.pid}.json`);
  await writeFile(caminho, JSON.stringify({ baseUrl: 'https://x.org' }), 'utf8');
  await assert.rejects(() => carregarConfig(caminho), /usuario/);
  await rm(caminho);
});

test('mensagem clara quando arquivo não existe', async () => {
  await assert.rejects(() => carregarConfig(join(tmpdir(), 'nao-existe-xyz.json')), /não encontrado/);
});
