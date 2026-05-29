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

  // 3) Idempotência: dias de junho já existentes com estado de completude
  const existentes = await cliente.listarJunho();
  // mapa: dia -> { id, completo }
  const mapaExistentes = new Map();
  for (const p of existentes) {
    const d = diaDaData(p.date);
    if (d && d.mes === 6) {
      mapaExistentes.set(d.dia, { id: p.id, completo: Number(p.meta?._dia_agenda) > 0 });
    }
  }
  if (mapaExistentes.size) {
    const completos = [...mapaExistentes.values()].filter((v) => v.completo).length;
    const incompletos = mapaExistentes.size - completos;
    log(`Já existem ${mapaExistentes.size} dia(s) de junho: ${completos} completo(s), ${incompletos} incompleto(s).`);
  }

  // 4) Processar cada dia
  const resumo = { criados: [], completados: [], pulados: [], erros: [] };
  for (const r of dados) {
    const existente = mapaExistentes.get(r.dia);
    const payload = montarPayload(r);

    if (!existente) {
      // Dia não existe: criar
      if (simular) {
        log(`dia ${r.dia}: [simulado] criaria "${payload.title}" date=${payload.date} _dia_agenda=${payload.meta._dia_agenda} titulo_dia="${payload.meta._titulo_meta_dia}".`);
        resumo.criados.push(r.dia);
        continue;
      }
      try {
        const novo = await cliente.criar(payload);
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
    } else if (existente.completo) {
      // Já completo: pular
      resumo.pulados.push(r.dia);
      log(`dia ${r.dia}: já completo, pulando.`);
    } else {
      // Existe mas incompleto: atualizar
      if (simular) {
        log(`dia ${r.dia}: [simulado] completaria id=${existente.id} _dia_agenda=${payload.meta._dia_agenda}.`);
        resumo.completados.push(r.dia);
        continue;
      }
      try {
        const atualizado = await cliente.atualizar(existente.id, payload);
        const lido = await cliente.lerPost(atualizado.id);
        const ok = lido.meta?._dia_agenda === payload.meta._dia_agenda
                && lido.meta?._titulo_meta_dia === payload.meta._titulo_meta_dia
                && lido.status === 'future';
        if (!ok) throw new Error(`validação pós-atualização falhou (id=${atualizado.id}, status=${lido.status})`);
        resumo.completados.push(r.dia);
        log(`dia ${r.dia}: completado (id=${atualizado.id}).`);
      } catch (e) {
        resumo.erros.push({ dia: r.dia, msg: e.message });
        log(`dia ${r.dia}: ERRO — ${e.message}`);
      }
    }
  }

  // 6) Resumo
  log('===== RESUMO =====');
  log(`Criados${simular ? ' (simulados)' : ''}: ${resumo.criados.length} (${resumo.criados.join(', ') || '-'})`);
  log(`Completados${simular ? ' (simulados)' : ''}: ${resumo.completados.length} (${resumo.completados.join(', ') || '-'})`);
  log(`Pulados (já completos): ${resumo.pulados.length} (${resumo.pulados.join(', ') || '-'})`);
  log(`Erros: ${resumo.erros.length}`);
  resumo.erros.forEach((e) => log(`  - dia ${e.dia}: ${e.msg}`));
  if (resumo.erros.length) process.exitCode = 1;
}

principal().catch((e) => { console.error(`[agenda] FALHA: ${e.stack || e.message}`); process.exitCode = 1; });
