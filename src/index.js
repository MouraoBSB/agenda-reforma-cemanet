// Agenda Reforma Íntima — orquestrador da carga
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarConfig } from './config.js';
import { criarCliente } from './siteClient.js';
import { validarDocumento, CAMPOS_TEXTO_DIA } from './montarPayload.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLAGS = ['--simular', '--executar', '--sobrescrever'];

const lista = (dias) => dias.join(', ') || '-';

// Compara o arquivo local com o mês lido do site, dia a dia.
// Um dia é "diferente" quando o PUT o alteraria: texto, rascunho a publicar ou formatação rica a achatar.
export function compararMes(dados, remoto) {
  const noSite = new Map((remoto?.dias ?? []).map((d) => [d.dia, d]));
  const resultado = { novos: [], iguais: [], diferentes: [], soNoSite: [], tituloMesDiferente: false };

  for (const local of dados.dias) {
    const atual = noSite.get(local.dia);
    if (!atual) {
      resultado.novos.push(local.dia);
      continue;
    }
    const campos = CAMPOS_TEXTO_DIA.filter((c) => local[c].trim() !== atual[c]);
    if (atual.status !== 'publicado') campos.push('status');
    if (atual.formatoRico) campos.push('formatoRico');
    if (campos.length) resultado.diferentes.push({ dia: local.dia, campos });
    else resultado.iguais.push(local.dia);
  }

  const locais = new Set(dados.dias.map((d) => d.dia));
  resultado.soNoSite = [...noSite.keys()].filter((dia) => !locais.has(dia));
  const tituloNoSite = remoto?.metaMesTitulo ?? null;
  resultado.tituloMesDiferente = tituloNoSite !== null && tituloNoSite !== dados.metaMesTitulo.trim();
  return resultado;
}

function relatarErro(e, log) {
  if (e.status === 401 || e.status === 403) {
    log(`PARE: a chave foi recusada pelo site — ${e.message}`);
    log('Avise o dono: a chave pode estar errada, vencida, revogada ou sem permissão.');
    return;
  }
  log(`ERRO: ${e.message}`);
  for (const d of e.dias ?? []) log(`  - dia ${d.dia ?? '?'} (posição ${d.posicao}), campo "${d.campo}": ${d.erro}`);
}

// Executa o fluxo completo de um mês. Retorna true quando tudo terminou como esperado.
export async function publicarMes({ cliente, arquivoDados, executar = false, sobrescrever = false, log = console.log }) {
  try {
    // 1) Credencial
    const eu = await cliente.quemSou();
    log(`Agente: ${eu.agente.nome} — chave "${eu.chave.nome}", validade: ${eu.chave.expiraEm ?? 'sem data de expiração'}.`);

    // 2) Dados locais
    let dados;
    try {
      dados = JSON.parse(await readFile(arquivoDados, 'utf8'));
    } catch (e) {
      log(`ERRO ao carregar "${arquivoDados}": ${e.message}`);
      return false;
    }
    const invalidos = validarDocumento(dados);
    if (invalidos.length) {
      log('ERRO: dados inválidos (nada foi enviado):');
      invalidos.forEach((m) => log(`  - ${m}`));
      return false;
    }
    const { ano, mes, mesNome } = dados;
    log(`Carregados ${dados.dias.length} dias de ${mesNome}/${ano} — meta do mês: "${dados.metaMesTitulo}".`);

    // 3) Comparação com o site
    const comparacao = compararMes(dados, await cliente.lerMes(ano, mes));
    const { novos, iguais, diferentes, soNoSite, tituloMesDiferente } = comparacao;
    log(`A criar: ${novos.length} (${lista(novos)})`);
    log(`Já iguais no site: ${iguais.length} (${lista(iguais)})`);
    log(`Existentes com diferença: ${diferentes.length}`);
    diferentes.forEach((d) => log(`  - dia ${d.dia}: ${d.campos.join(', ')}`));
    if (tituloMesDiferente) log('O título da meta do mês no site é diferente do arquivo e seria trocado.');
    if (soNoSite.length) log(`Dias que existem no site e não estão no arquivo (não são tocados): ${lista(soNoSite)}`);

    if (!executar) {
      log('SIMULAÇÃO: nada foi gravado. Use --executar para gravar.');
      return true;
    }

    // 4) Trava do cliente: o servidor sobrescreve sempre
    if ((diferentes.length || tituloMesDiferente) && !sobrescrever) {
      log('BLOQUEADO: há conteúdo no site diferente do arquivo. Confira os campos acima e, se for isso mesmo, repita com --sobrescrever.');
      return false;
    }

    // 5) Gravação do mês inteiro
    const resposta = await cliente.gravarMes(ano, mes, dados);
    const { criados, atualizados, inalterados } = resposta.resumo;
    log(`Gravado: ${criados} criado(s), ${atualizados} atualizado(s), ${inalterados} inalterado(s).`);
    resposta.dias.filter((d) => d.estado === 'atualizado').forEach((d) => log(`  - dia ${d.dia} atualizado: ${d.campos.join(', ')}`));
    (resposta.avisos ?? []).forEach((a) => log(`AVISO do site: ${a}`));
    let ok = true;
    if (criados !== novos.length || atualizados !== diferentes.length || inalterados !== iguais.length) {
      log(`DIVERGÊNCIA: o esperado era ${novos.length} criado(s), ${diferentes.length} atualizado(s), ${iguais.length} inalterado(s).`);
      ok = false;
    }

    // 6) Releitura: o que está no site tem de ser o que foi enviado
    const relido = compararMes(dados, await cliente.lerMes(ano, mes));
    if (relido.novos.length || relido.diferentes.length || relido.tituloMesDiferente) {
      log('ERRO na releitura: o site não devolveu o que foi enviado.');
      if (relido.novos.length) log(`  - dias ausentes: ${lista(relido.novos)}`);
      relido.diferentes.forEach((d) => log(`  - dia ${d.dia}: ${d.campos.join(', ')}`));
      if (relido.tituloMesDiferente) log('  - título da meta do mês diferente');
      return false;
    }
    log(`Releitura conferida: ${relido.iguais.length} dia(s) iguais ao enviado.`);
    return ok;
  } catch (e) {
    relatarErro(e, log);
    return false;
  }
}

async function principal() {
  const args = process.argv.slice(2);
  const slugMes = args.find((a) => !a.startsWith('--'));
  const desconhecidas = args.filter((a) => a.startsWith('--') && !FLAGS.includes(a));
  const executar = args.includes('--executar');
  const sobrescrever = args.includes('--sobrescrever');
  const log = (msg) => console.log(`[agenda] ${msg}`);

  if (!slugMes || desconhecidas.length || (executar && args.includes('--simular')) || (sobrescrever && !executar)) {
    console.error('[agenda] ERRO: uso — node src/index.js <mes-ano> [--executar [--sobrescrever]]. Ex.: node src/index.js novembro-2026');
    process.exitCode = 1;
    return;
  }

  log(executar ? 'MODO EXECUÇÃO (gravando no site).' : 'MODO SIMULAÇÃO (nada será gravado).');
  const cliente = criarCliente({
    ...carregarConfig(),
    aoReenviar: ({ erro, ms }) => log(`${erro} — nova tentativa em ${Math.round(ms / 1000)} s.`)
  });
  const ok = await publicarMes({ cliente, arquivoDados: join(RAIZ, 'dados', `${slugMes}.json`), executar, sobrescrever, log });
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(`[agenda] FALHA: ${e.message}`); process.exitCode = 1; });
}
