// Agenda Reforma Íntima — montagem de payload por dia
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { timestampDiaUTC, paragrafo } from './util.js';

const OBRIGATORIOS = ['reflexao', 'metaMesTexto', 'tituloMetaDia', 'metaDia', 'prece'];

// Retorna lista de erros (vazia se o registro é válido).
export function validarRegistro(r) {
  const erros = [];
  if (!Number.isInteger(r?.dia) || r.dia < 1 || r.dia > 31) {
    erros.push(`dia inválido: ${r?.dia}`);
  }
  for (const campo of OBRIGATORIOS) {
    if (!r?.[campo] || !String(r[campo]).trim()) {
      erros.push(`campo "${campo}" vazio`);
    }
  }
  return erros;
}

// Retorna lista de erros se o objeto de metadados do mês for inválido.
export function validarMes(mesInfo) {
  const erros = [];
  if (!Number.isInteger(mesInfo?.ano)) {
    erros.push('campo "ano" deve ser inteiro');
  }
  if (!Number.isInteger(mesInfo?.mes) || mesInfo.mes < 1 || mesInfo.mes > 12) {
    erros.push('campo "mes" deve ser inteiro entre 1 e 12');
  }
  if (!mesInfo?.mesNome || !String(mesInfo.mesNome).trim()) {
    erros.push('campo "mesNome" vazio');
  }
  if (!mesInfo?.metaMesTitulo || !String(mesInfo.metaMesTitulo).trim()) {
    erros.push('campo "metaMesTitulo" vazio');
  }
  return erros;
}

// Transforma um registro de dia no corpo aceito pelo endpoint REST.
export function montarPayload(r, mes) {
  const dd = String(r.dia).padStart(2, '0');
  const mm = String(mes.mes).padStart(2, '0');
  return {
    title: `${dd} de ${mes.mesNome} de ${mes.ano}`,
    status: 'future',
    date: `${mes.ano}-${mm}-${dd}T00:00:00`,
    meta: {
      _dia_agenda: timestampDiaUTC(mes.ano, mes.mes, r.dia),
      _reflexao: paragrafo(r.reflexao),
      possui_meta_mes: 'true',
      _mes_titulo: mes.metaMesTitulo,
      _mes_texto: paragrafo(r.metaMesTexto),
      possui_meta_dia: 'true',
      _titulo_meta_dia: r.tituloMetaDia,
      _dia: paragrafo(r.metaDia),
      _prece: paragrafo(r.prece),
      possui_imagem: 'false',
      possui_tema: 'false',
      _imagem: '',
      _texto_imagem: '',
      _tema: ''
    }
  };
}
