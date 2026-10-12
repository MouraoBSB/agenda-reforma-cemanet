// Agenda Reforma Íntima — validação local do mês (espelha as regras da API do site)
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { MESES } from './converterMes.js';

export const CAMPOS_TEXTO_DIA = ['reflexao', 'metaMesTexto', 'tituloMetaDia', 'metaDia', 'prece'];

const LIMITES = { metaMesTitulo: 255, tituloMetaDia: 255, reflexao: 2000, metaMesTexto: 2000, metaDia: 1000, prece: 1000 };
const CHAVES_MES = ['ano', 'mes', 'mesNome', 'metaMesTitulo', 'dias'];
const CHAVES_DIA = ['dia', ...CAMPOS_TEXTO_DIA];
const CONTROLE = /[\p{Cc}\u2028\u2029]/u;

function ehObjeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function errosDeChaves(obj, aceitas) {
  return Object.keys(obj).filter((k) => !aceitas.includes(k)).map((k) => `campo "${k}" não aceito`);
}

function errosDeTexto(campo, valor) {
  if (typeof valor !== 'string' || !valor.trim()) return [`campo "${campo}" vazio`];
  const erros = [];
  const tamanho = [...valor.trim()].length;
  if (tamanho > LIMITES[campo]) erros.push(`campo "${campo}" passa de ${LIMITES[campo]} caracteres (tem ${tamanho})`);
  if (CONTROLE.test(valor)) erros.push(`campo "${campo}" contém quebra de linha ou caractere de controle`);
  if (valor.includes('://')) erros.push(`campo "${campo}" contém endereço de site ("://")`);
  return erros;
}

// Retorna lista de erros (vazia se o registro do dia é válido).
export function validarRegistro(r) {
  if (!ehObjeto(r)) return ['registro do dia não é um objeto'];
  const erros = errosDeChaves(r, CHAVES_DIA);
  if (!Number.isInteger(r.dia) || r.dia < 1 || r.dia > 31) erros.push(`dia inválido: ${r.dia}`);
  for (const campo of CAMPOS_TEXTO_DIA) erros.push(...errosDeTexto(campo, r[campo]));
  return erros;
}

// Retorna lista de erros dos metadados do mês (ano, mes, mesNome, metaMesTitulo).
export function validarMes(mesInfo) {
  if (!ehObjeto(mesInfo)) return ['o mês não é um objeto'];
  const erros = errosDeChaves(mesInfo, CHAVES_MES);
  if (!Number.isInteger(mesInfo.ano) || mesInfo.ano < 2024 || mesInfo.ano > 2100) {
    erros.push('campo "ano" deve ser inteiro entre 2024 e 2100');
  }
  const mesValido = Number.isInteger(mesInfo.mes) && mesInfo.mes >= 1 && mesInfo.mes <= 12;
  if (!mesValido) erros.push('campo "mes" deve ser inteiro entre 1 e 12');
  if (mesInfo.mesNome !== undefined) {
    const esperado = mesValido ? MESES[mesInfo.mes - 1] : null;
    if (typeof mesInfo.mesNome !== 'string' || !mesInfo.mesNome.trim()) erros.push('campo "mesNome" vazio');
    else if (esperado && mesInfo.mesNome.trim().toLowerCase() !== esperado.toLowerCase()) {
      erros.push(`campo "mesNome" deveria ser "${esperado}" para o mês ${mesInfo.mes}`);
    }
  }
  erros.push(...errosDeTexto('metaMesTitulo', mesInfo.metaMesTitulo));
  return erros;
}

// Valida o arquivo do mês inteiro, coletando todos os erros (não para no primeiro).
export function validarDocumento(dados) {
  const erros = validarMes(dados);
  if (!ehObjeto(dados)) return erros;
  if (!Array.isArray(dados.dias) || dados.dias.length < 1 || dados.dias.length > 31) {
    erros.push('campo "dias" deve ser uma lista de 1 a 31 itens');
    return erros;
  }
  const vistos = new Set();
  dados.dias.forEach((r, posicao) => {
    const rotulo = Number.isInteger(r?.dia) ? `dia ${r.dia}` : `item ${posicao}`;
    erros.push(...validarRegistro(r).map((msg) => `${rotulo}: ${msg}`));
    if (!Number.isInteger(r?.dia)) return;
    if (vistos.has(r.dia)) erros.push(`${rotulo}: dia repetido`);
    vistos.add(r.dia);
    const data = new Date(Date.UTC(dados.ano, dados.mes - 1, r.dia));
    if (Number.isInteger(dados.ano) && Number.isInteger(dados.mes) && data.getUTCMonth() !== dados.mes - 1) {
      erros.push(`${rotulo}: a data ${r.dia}/${dados.mes}/${dados.ano} não existe`);
    }
  });
  return erros;
}
