import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCliente, ErroApi } from '../src/siteClient.js';

const CHAVE_FALSA = 'chave-falsa-de-teste';

// Cria um cliente com fetch simulado; nenhuma chamada sai para a rede.
function clienteSimulado(respostas) {
  const chamadas = [];
  const esperas = [];
  const buscar = async (url, opts) => {
    chamadas.push({ url, opts });
    const r = respostas.shift();
    if (r.falha) throw new Error(r.falha);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(r.headers ?? {}),
      text: async () => (r.texto ?? (r.body === undefined ? '' : JSON.stringify(r.body)))
    };
  };
  const cliente = criarCliente({
    baseUrl: 'https://x.org/api/v1', chave: CHAVE_FALSA, buscar, esperasMs: [10, 20, 30],
    esperar: async (ms) => { esperas.push(ms); }
  });
  return { cliente, chamadas, esperas };
}

const erro = (codigo, mensagem) => ({ erro: { codigo, mensagem } });

test('quemSou envia GET /eu com Bearer e Accept JSON', async () => {
  const { cliente, chamadas } = clienteSimulado([{ status: 200, body: { agente: { id: 1, nome: 'Agente' } } }]);
  const eu = await cliente.quemSou();
  assert.equal(eu.agente.nome, 'Agente');
  assert.equal(chamadas[0].url, 'https://x.org/api/v1/eu');
  assert.equal(chamadas[0].opts.method, 'GET');
  assert.equal(chamadas[0].opts.headers.Authorization, `Bearer ${CHAVE_FALSA}`);
  assert.equal(chamadas[0].opts.headers.Accept, 'application/json');
  assert.equal(chamadas[0].opts.body, undefined);
});

test('lerMes consulta o endereço do mês', async () => {
  const { cliente, chamadas } = clienteSimulado([{ status: 200, body: { ano: 2026, mes: 11, metaMesTitulo: null, dias: [] } }]);
  const mes = await cliente.lerMes(2026, 11);
  assert.deepEqual(mes.dias, []);
  assert.equal(chamadas[0].url, 'https://x.org/api/v1/agenda/meses/2026/11');
});

test('gravarMes envia PUT com o corpo em JSON UTF-8', async () => {
  const { cliente, chamadas } = clienteSimulado([{ status: 200, body: { resumo: { criados: 1, atualizados: 0, inalterados: 0 } } }]);
  const corpo = { ano: 2026, mes: 11, dias: [{ dia: 1, prece: 'coração' }] };
  const r = await cliente.gravarMes(2026, 11, corpo);
  assert.equal(r.resumo.criados, 1);
  assert.equal(chamadas[0].opts.method, 'PUT');
  assert.match(chamadas[0].opts.headers['Content-Type'], /application\/json; charset=utf-8/);
  assert.deepEqual(JSON.parse(chamadas[0].opts.body.toString('utf8')), corpo);
});

test('4xx fora da lista de reenvio lança na hora, sem nova tentativa', async () => {
  for (const status of [400, 401, 403, 404, 413, 422]) {
    const { cliente, chamadas, esperas } = clienteSimulado([{ status, body: erro('codigo_x', 'mensagem x') }]);
    await assert.rejects(() => cliente.quemSou(), (e) => e instanceof ErroApi && e.status === status && e.codigo === 'codigo_x');
    assert.equal(chamadas.length, 1);
    assert.equal(esperas.length, 0);
  }
});

test('422 carrega a lista de erros por dia', async () => {
  const body = { ...erro('mes_invalido', 'O mês não foi gravado: 1 erro(s).'), dias: [{ dia: 7, posicao: 6, campo: 'prece', erro: 'Passa de 1000 caracteres.' }] };
  const { cliente } = clienteSimulado([{ status: 422, body }]);
  await assert.rejects(() => cliente.gravarMes(2026, 11, {}), (e) => e.dias.length === 1 && e.dias[0].campo === 'prece' && /mes_invalido/.test(e.message));
});

test('409 e 503 são reenviados com espera progressiva até dar certo', async () => {
  const { cliente, chamadas, esperas } = clienteSimulado([
    { status: 409, body: erro('conflito_de_gravacao', 'conflito') },
    { status: 503, texto: '<html>proxy</html>' },
    { status: 200, body: { ok: true } }
  ]);
  assert.deepEqual(await cliente.gravarMes(2026, 11, {}), { ok: true });
  assert.equal(chamadas.length, 3);
  assert.deepEqual(esperas, [10, 20]);
});

test('429 respeita o Retry-After do servidor', async () => {
  const { cliente, esperas } = clienteSimulado([
    { status: 429, body: erro('limite_excedido', 'devagar'), headers: { 'Retry-After': '7' } },
    { status: 200, body: {} }
  ]);
  await cliente.quemSou();
  assert.deepEqual(esperas, [7000]);
});

test('500 é reenviado uma única vez', async () => {
  const { cliente, chamadas } = clienteSimulado([
    { status: 500, body: erro('erro_interno', 'falha') },
    { status: 500, body: erro('erro_interno', 'falha') }
  ]);
  await assert.rejects(() => cliente.quemSou(), /HTTP 500 \(erro_interno\)/);
  assert.equal(chamadas.length, 2);
});

test('502 persistente desiste depois das esperas configuradas', async () => {
  const { cliente, chamadas } = clienteSimulado(Array.from({ length: 4 }, () => ({ status: 502, texto: 'Bad Gateway' })));
  await assert.rejects(() => cliente.quemSou(), /HTTP 502/);
  assert.equal(chamadas.length, 4);
});

test('falha de rede é reenviada', async () => {
  const { cliente, chamadas } = clienteSimulado([{ falha: 'conexão recusada' }, { status: 200, body: { ok: true } }]);
  assert.deepEqual(await cliente.quemSou(), { ok: true });
  assert.equal(chamadas.length, 2);
});

test('a chave nunca aparece na mensagem de erro', async () => {
  const casos = [[{ status: 401, body: erro('nao_autenticado', 'Chave inválida.') }], Array.from({ length: 4 }, () => ({ falha: 'sem rede' }))];
  for (const respostas of casos) {
    const { cliente } = clienteSimulado(respostas);
    await assert.rejects(() => cliente.quemSou(), (e) => !e.message.includes(CHAVE_FALSA) && !String(e.stack).includes(CHAVE_FALSA));
  }
});
