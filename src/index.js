// Agenda Reforma Íntima — orquestrador da carga
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarConfig } from './config.js';
import { criarCliente } from './wpClient.js';
import { montarPayload, validarRegistro, validarMes } from './montarPayload.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function log(msg) { console.log(`[agenda] ${msg}`); }

// Extrai o dia (1..31) e mês da string ISO local "2026-MM-DDT..." (sem timezone, sem Date).
function diaDaData(dataIso) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(dataIso);
  return m ? { mes: Number(m[1]), dia: Number(m[2]) } : null;
}

async function principal() {
  // Determina slug do mês: primeiro argumento posicional (não flag)
  const args = process.argv.slice(2);
  const slugMes = args.find((a) => !a.startsWith('--'));
  if (!slugMes) {
    console.error('[agenda] ERRO: Informe o mês. Ex.: node src/index.js julho-2026 --simular');
    process.exitCode = 1;
    return;
  }

  const executar = args.includes('--executar');
  const simularFlag = args.includes('--simular');
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
  const arquivoDados = join(RAIZ, 'dados', `${slugMes}.json`);
  let dados;
  try {
    dados = JSON.parse(await readFile(arquivoDados, 'utf8'));
  } catch (e) {
    log(`ERRO ao carregar arquivo "${slugMes}.json": ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const { ano, mes, mesNome, metaMesTitulo, dias } = dados;
  const errosMes = validarMes({ ano, mes, mesNome, metaMesTitulo });
  if (errosMes.length) {
    log('ERRO: metadados do mês inválidos:');
    errosMes.forEach((m) => log(`  - ${m}`));
    process.exitCode = 1;
    return;
  }

  const invalidos = dias.flatMap((r) => validarRegistro(r).map((msg) => `dia ${r?.dia}: ${msg}`));
  if (invalidos.length) {
    log('ERRO: dados inválidos:');
    invalidos.forEach((m) => log(`  - ${m}`));
    process.exitCode = 1;
    return;
  }
  log(`Carregados ${dias.length} dias de ${mesNome}/${ano}.`);

  // 3) Idempotência: dias do mês já existentes
  const existentes = await cliente.listarMes(ano, mes);
  // mapa: dia -> { id, completo }
  const mapaExistentes = new Map();
  for (const p of existentes) {
    const d = diaDaData(p.date);
    if (d && d.mes === mes) {
      mapaExistentes.set(d.dia, { id: p.id, completo: Number(p.meta?._dia_agenda) > 0 });
    }
  }
  if (mapaExistentes.size) {
    const completos = [...mapaExistentes.values()].filter((v) => v.completo).length;
    const incompletos = mapaExistentes.size - completos;
    log(`Já existem ${mapaExistentes.size} dia(s) de ${mesNome}: ${completos} completo(s), ${incompletos} incompleto(s).`);
  }

  // 4) Processar cada dia
  const mesInfo = { ano, mes, mesNome, metaMesTitulo };
  const resumo = { criados: [], completados: [], pulados: [], erros: [] };
  for (const r of dias) {
    const existente = mapaExistentes.get(r.dia);
    const payload = montarPayload(r, mesInfo);

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

  // 5) Resumo
  log('===== RESUMO =====');
  log(`Criados${simular ? ' (simulados)' : ''}: ${resumo.criados.length} (${resumo.criados.join(', ') || '-'})`);
  log(`Completados${simular ? ' (simulados)' : ''}: ${resumo.completados.length} (${resumo.completados.join(', ') || '-'})`);
  log(`Pulados (já completos): ${resumo.pulados.length} (${resumo.pulados.join(', ') || '-'})`);
  log(`Erros: ${resumo.erros.length}`);
  resumo.erros.forEach((e) => log(`  - dia ${e.dia}: ${e.msg}`));
  if (resumo.erros.length) process.exitCode = 1;
}

principal().catch((e) => { console.error(`[agenda] FALHA: ${e.stack || e.message}`); process.exitCode = 1; });
