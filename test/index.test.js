import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compararMes, publicarMes } from '../src/index.js';
import { ErroApi } from '../src/siteClient.js';

const dia = (n, extra = {}) => ({
  dia: n, reflexao: `Reflexão ${n}`, metaMesTexto: `Texto do mês ${n}`, tituloMetaDia: 'Combater o Apego',
  metaDia: `Meta ${n}`, prece: `Prece ${n}`, ...extra
});
const DADOS = { ano: 2026, mes: 11, mesNome: 'Novembro', metaMesTitulo: 'Combater o egoísmo', dias: [dia(1), dia(2), dia(3)] };
const noSite = (d) => ({ ...d, data: `2026-11-0${d.dia}`, status: 'publicado', formatoRico: false });
const mesNoSite = (dias, titulo = DADOS.metaMesTitulo) => ({ ano: 2026, mes: 11, mesNome: 'Novembro', metaMesTitulo: titulo, dias: dias.map(noSite) });
const MES_VAZIO = { ano: 2026, mes: 11, mesNome: 'Novembro', metaMesTitulo: null, dias: [] };

// Cliente simulado: devolve as leituras na ordem e registra o que foi gravado.
function clienteSimulado({ leituras, resposta, erroAoGravar }) {
  const gravados = [];
  return {
    gravados,
    quemSou: async () => ({ agente: { id: 1, nome: 'Agente da Agenda' }, chave: { nome: 'teste', expiraEm: '2027-10-20T00:00:00-03:00' } }),
    lerMes: async () => leituras.shift(),
    gravarMes: async (ano, mes, corpo) => {
      if (erroAoGravar) throw erroAoGravar;
      gravados.push({ ano, mes, corpo });
      return resposta;
    }
  };
}

async function rodar(opcoes, dados = DADOS) {
  const arquivoDados = join(tmpdir(), `agenda-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(arquivoDados, JSON.stringify(dados), 'utf8');
  const linhas = [];
  try {
    const ok = await publicarMes({ ...opcoes, arquivoDados, log: (m) => linhas.push(m) });
    return { ok, saida: linhas.join('\n') };
  } finally {
    await rm(arquivoDados);
  }
}

const respostaPut = (estados) => ({
  resumo: {
    criados: estados.filter((e) => e === 'criado').length,
    atualizados: estados.filter((e) => Array.isArray(e)).length,
    inalterados: estados.filter((e) => e === 'inalterado').length
  },
  dias: estados.map((e, i) => ({ dia: i + 1, estado: Array.isArray(e) ? 'atualizado' : e, campos: Array.isArray(e) ? e : [] })),
  avisos: []
});

test('compararMes separa dias novos, iguais e diferentes', () => {
  const remoto = mesNoSite([dia(1), dia(2, { prece: 'Outra prece', metaDia: 'Outra meta' })]);
  const c = compararMes(DADOS, remoto);
  assert.deepEqual(c.novos, [3]);
  assert.deepEqual(c.iguais, [1]);
  assert.deepEqual(c.diferentes, [{ dia: 2, campos: ['metaDia', 'prece'] }]);
  assert.equal(c.tituloMesDiferente, false);
});

test('compararMes trata rascunho e formatação rica como diferença', () => {
  const remoto = mesNoSite([dia(1), dia(2), dia(3)]);
  remoto.dias[0].status = 'rascunho';
  remoto.dias[1].formatoRico = true;
  assert.deepEqual(compararMes(DADOS, remoto).diferentes, [{ dia: 1, campos: ['status'] }, { dia: 2, campos: ['formatoRico'] }]);
});

test('compararMes aponta título do mês diferente e dias que só existem no site', () => {
  const c = compararMes(DADOS, mesNoSite([dia(1), dia(2), dia(3), dia(4)], 'Outro título'));
  assert.equal(c.tituloMesDiferente, true);
  assert.deepEqual(c.soNoSite, [4]);
  assert.equal(compararMes(DADOS, MES_VAZIO).tituloMesDiferente, false);
});

test('simulação mostra agente, validade e contagem, sem gravar', async () => {
  const cliente = clienteSimulado({ leituras: [MES_VAZIO] });
  const { ok, saida } = await rodar({ cliente });
  assert.equal(ok, true);
  assert.equal(cliente.gravados.length, 0);
  assert.match(saida, /Agente da Agenda/);
  assert.match(saida, /2027-10-20/);
  assert.match(saida, /A criar: 3 \(1, 2, 3\)/);
  assert.match(saida, /SIMULAÇÃO: nada foi gravado/);
});

test('execução cria o mês com um único PUT e confere a releitura', async () => {
  const cliente = clienteSimulado({ leituras: [MES_VAZIO, mesNoSite(DADOS.dias)], resposta: respostaPut(['criado', 'criado', 'criado']) });
  const { ok, saida } = await rodar({ cliente, executar: true });
  assert.equal(ok, true);
  assert.equal(cliente.gravados.length, 1);
  assert.deepEqual(cliente.gravados[0], { ano: 2026, mes: 11, corpo: DADOS });
  assert.match(saida, /3 criado\(s\), 0 atualizado\(s\), 0 inalterado\(s\)/);
  assert.match(saida, /Releitura conferida: 3 dia\(s\)/);
});

test('mês já igual é reenviado e volta tudo inalterado', async () => {
  const cliente = clienteSimulado({
    leituras: [mesNoSite(DADOS.dias), mesNoSite(DADOS.dias)], resposta: respostaPut(['inalterado', 'inalterado', 'inalterado'])
  });
  const { ok, saida } = await rodar({ cliente, executar: true });
  assert.equal(ok, true);
  assert.match(saida, /0 criado\(s\), 0 atualizado\(s\), 3 inalterado\(s\)/);
});

test('dia existente com texto diferente bloqueia o envio sem --sobrescrever', async () => {
  const remoto = mesNoSite([dia(1), dia(2, { prece: 'Corrigida no painel' }), dia(3)]);
  const cliente = clienteSimulado({ leituras: [remoto] });
  const { ok, saida } = await rodar({ cliente, executar: true });
  assert.equal(ok, false);
  assert.equal(cliente.gravados.length, 0);
  assert.match(saida, /dia 2: prece/);
  assert.match(saida, /BLOQUEADO/);
});

test('com --sobrescrever envia e mostra os campos de cada dia atualizado', async () => {
  const remoto = mesNoSite([dia(1), dia(2, { prece: 'Corrigida no painel' }), dia(3)]);
  const cliente = clienteSimulado({ leituras: [remoto, mesNoSite(DADOS.dias)], resposta: respostaPut(['inalterado', ['prece'], 'inalterado']) });
  const { ok, saida } = await rodar({ cliente, executar: true, sobrescrever: true });
  assert.equal(ok, true);
  assert.equal(cliente.gravados.length, 1);
  assert.match(saida, /dia 2 atualizado: prece/);
});

test('título do mês diferente também exige --sobrescrever', async () => {
  const cliente = clienteSimulado({ leituras: [mesNoSite(DADOS.dias, 'Título antigo')] });
  const { ok, saida } = await rodar({ cliente, executar: true });
  assert.equal(ok, false);
  assert.equal(cliente.gravados.length, 0);
  assert.match(saida, /título da meta do mês/);
});

test('releitura diferente do enviado é erro', async () => {
  const relido = mesNoSite([dia(1), dia(2, { reflexao: 'Texto trocado' })]);
  const cliente = clienteSimulado({ leituras: [MES_VAZIO, relido], resposta: respostaPut(['criado', 'criado', 'criado']) });
  const { ok, saida } = await rodar({ cliente, executar: true });
  assert.equal(ok, false);
  assert.match(saida, /ERRO na releitura/);
  assert.match(saida, /dia 2: reflexao/);
  assert.match(saida, /dias ausentes: 3/);
});

test('resumo do servidor diferente do previsto é apontado como divergência', async () => {
  const cliente = clienteSimulado({ leituras: [MES_VAZIO, mesNoSite(DADOS.dias)], resposta: respostaPut(['criado', 'criado', 'inalterado']) });
  const { ok, saida } = await rodar({ cliente, executar: true });
  assert.equal(ok, false);
  assert.match(saida, /DIVERGÊNCIA/);
});

test('dados inválidos param antes de consultar o mês e de gravar', async () => {
  const cliente = clienteSimulado({ leituras: [] });
  const { ok, saida } = await rodar({ cliente, executar: true }, { ...DADOS, dias: [dia(1, { prece: 'linha\nquebrada' })] });
  assert.equal(ok, false);
  assert.equal(cliente.gravados.length, 0);
  assert.match(saida, /dia 1: campo "prece" contém quebra de linha/);
});

test('401 manda parar e avisar o dono; 422 lista os erros por dia', async () => {
  const recusada = new ErroApi(401, { erro: { codigo: 'nao_autenticado', mensagem: 'Chave inválida.' } });
  let r = await rodar({ cliente: clienteSimulado({ leituras: [MES_VAZIO], erroAoGravar: recusada }), executar: true });
  assert.equal(r.ok, false);
  assert.match(r.saida, /PARE: a chave foi recusada/);
  assert.match(r.saida, /Avise o dono/);

  const invalido = new ErroApi(422, {
    erro: { codigo: 'mes_invalido', mensagem: 'O mês não foi gravado: 1 erro(s).' },
    dias: [{ dia: 7, posicao: 6, campo: 'prece', erro: 'Passa de 1000 caracteres (tem 1204).' }]
  });
  r = await rodar({ cliente: clienteSimulado({ leituras: [MES_VAZIO], erroAoGravar: invalido }), executar: true });
  assert.equal(r.ok, false);
  assert.match(r.saida, /dia 7 \(posição 6\), campo "prece": Passa de 1000/);
});
