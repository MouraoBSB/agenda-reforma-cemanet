import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCliente } from '../src/wpClient.js';

function mockFetch(respostas) {
  const chamadas = [];
  global.fetch = async (url, opts) => {
    chamadas.push({ url, opts });
    const r = respostas.shift();
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body === undefined ? '' : JSON.stringify(r.body))
    };
  };
  return chamadas;
}

const cliente = criarCliente({ baseUrl: 'https://x.org', authHeader: 'Basic abc' });

test('criar envia POST com Authorization e Content-Type UTF-8', async () => {
  const chamadas = mockFetch([{ status: 201, body: { id: 99 } }]);
  const r = await cliente.criar({ title: 'Olá', meta: { _x: 'ção' } });
  assert.equal(r.id, 99);
  const c = chamadas[0];
  assert.equal(c.url, 'https://x.org/wp-json/wp/v2/agenda-reforma');
  assert.equal(c.opts.method, 'POST');
  assert.equal(c.opts.headers.Authorization, 'Basic abc');
  assert.match(c.opts.headers['Content-Type'], /charset=utf-8/);
});

test('erro 4xx lança imediatamente sem retry', async () => {
  const chamadas = mockFetch([{ status: 400, body: { message: 'inválido' } }]);
  await assert.rejects(() => cliente.criar({}), /HTTP 400.*inválido/);
  assert.equal(chamadas.length, 1);
});

test('erro 5xx faz retry e depois sucesso', async () => {
  const chamadas = mockFetch([{ status: 503, body: { message: 'indisp' } }, { status: 201, body: { id: 7 } }]);
  const r = await cliente.criar({});
  assert.equal(r.id, 7);
  assert.equal(chamadas.length, 2);
});

test('listarJunho monta query com intervalo e status', async () => {
  const chamadas = mockFetch([{ status: 200, body: [] }]);
  await cliente.listarJunho();
  assert.match(chamadas[0].url, /status=publish,future/);
  assert.match(chamadas[0].url, /after=2026-05-31T23:59:59/);
  assert.match(chamadas[0].url, /before=2026-07-01T00:00:00/);
});
