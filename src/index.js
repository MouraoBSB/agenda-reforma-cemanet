// Agenda Reforma Íntima — orquestrador da carga
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarConfig } from './config.js';
import { criarCliente } from './wpClient.js';
import { montarPayload, validarRegistro } from './montarPayload.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function log(msg) { console.log(`[agenda] ${msg}`); }

// Extrai o dia (1..31) da string ISO local "2026-06-DDT..." (sem timezone, sem Date).
function diaDaData(dataIso) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(dataIso);
  return m ? { mes: Number(m[1]), dia: Number(m[2]) } : null;
}

async function principal() {
  const executar = process.argv.includes('--executar');
  const simularFlag = process.argv.includes('--simular');
  if (executar && simularFlag) {
    console.error('[agenda] ERRO: use apenas uma flag por vez (--simular OU --executar).');
    process.exitCode = 1;
    return;
  }
  const simular = !executar; // padrão: simulação (sem flag ou com --simular)
  log(simular ? 'MODO SIMULAÇÃO (nada será gravado). Use --executar para gravar.' : 'MODO EXECUÇÃO (gravando no site).');

  const cfg = await carregarConfig();
  const cliente = criarCliente(cfg);

  // 1) Autenticação
  try {
    const eu = await cliente.usuarioAtual();
    log(`Autenticado como id=${eu.id} (${eu.slug}).`);
  } catch (e) {
    log(`ERRO de autenticação: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  // 2) Dados
  const dados = JSON.parse(await readFile(join(RAIZ, 'dados', 'junho-2026.json'), 'utf8'));
  const invalidos = dados.flatMap((r) => validarRegistro(r).map((msg) => `dia ${r?.dia}: ${msg}`));
  if (invalidos.length) {
    log('ERRO: dados inválidos:');
    invalidos.forEach((m) => log(`  - ${m}`));
    process.exitCode = 1;
    return;
  }
  log(`Carregados ${dados.length} dias de junho/2026.`);

  // 3) Idempotência: dias de junho já existentes
  const existentes = await cliente.listarJunho();
  const diasExistentes = new Set(
    existentes.map((p) => diaDaData(p.date)).filter((d) => d && d.mes === 6).map((d) => d.dia)
  );
  if (diasExistentes.size) log(`Já existem ${diasExistentes.size} dia(s) de junho: ${[...diasExistentes].sort((a,b)=>a-b).join(', ')}.`);

  // 4) Criar
  const resumo = { criados: [], pulados: [], erros: [] };
  for (const r of dados) {
    if (diasExistentes.has(r.dia)) { resumo.pulados.push(r.dia); log(`dia ${r.dia}: já existe, pulando.`); continue; }
    const payload = montarPayload(r);
    if (simular) {
      log(`dia ${r.dia}: [simulado] criaria "${payload.title}" date=${payload.date} _dia_agenda=${payload.meta._dia_agenda} titulo_dia="${payload.meta._titulo_meta_dia}".`);
      resumo.criados.push(r.dia);
      continue;
    }
    try {
      const novo = await cliente.criar(payload);
      // 5) validação pós-criação
      const lido = await cliente.lerPost(novo.id);
      const ok = lido.meta?._dia_agenda === payload.meta._dia_agenda
              && lido.meta?._titulo_meta_dia === payload.meta._titulo_meta_dia
              && lido.status === 'future';
      if (!ok) throw new Error(`validação pós-criação falhou (id=${novo.id}, status=${lido.status})`);
      resumo.criados.push(r.dia);
      log(`dia ${r.dia}: criado e validado (id=${novo.id}).`);
    } catch (e) {
      resumo.erros.push({ dia: r.dia, msg: e.message });
      log(`dia ${r.dia}: ERRO — ${e.message}`);
    }
  }

  // 6) Resumo
  log('===== RESUMO =====');
  log(`Criados${simular ? ' (simulados)' : ''}: ${resumo.criados.length} (${resumo.criados.join(', ') || '-'})`);
  log(`Pulados (já existiam): ${resumo.pulados.length} (${resumo.pulados.join(', ') || '-'})`);
  log(`Erros: ${resumo.erros.length}`);
  resumo.erros.forEach((e) => log(`  - dia ${e.dia}: ${e.msg}`));
  if (resumo.erros.length) process.exitCode = 1;
}

principal().catch((e) => { console.error(`[agenda] FALHA: ${e.stack || e.message}`); process.exitCode = 1; });
