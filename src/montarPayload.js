// Agenda Reforma Íntima — montagem de payload por dia
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { timestampDiaUTC, paragrafo } from './util.js';

const ANO = 2026;
const MES = 6; // junho
const MES_NOME = 'Junho';
const META_MES_TITULO = 'Combater o egoísmo: indiferença e ingratidão';
const OBRIGATORIOS = ['reflexao', 'metaMesTexto', 'tituloMetaDia', 'metaDia', 'prece'];

// Retorna lista de erros (vazia se o registro é válido).
export function validarRegistro(r) {
  const erros = [];
  if (!Number.isInteger(r?.dia) || r.dia < 1 || r.dia > 30) {
    erros.push(`dia inválido: ${r?.dia}`);
  }
  for (const campo of OBRIGATORIOS) {
    if (!r?.[campo] || !String(r[campo]).trim()) {
      erros.push(`campo "${campo}" vazio`);
    }
  }
  return erros;
}

// Transforma um registro de dia no corpo aceito pelo endpoint REST.
export function montarPayload(r) {
  const dd = String(r.dia).padStart(2, '0');
  const mm = String(MES).padStart(2, '0');
  return {
    title: `${dd} de ${MES_NOME} de ${ANO}`,
    status: 'future',
    date: `${ANO}-${mm}-${dd}T00:00:00`,
    meta: {
      _dia_agenda: timestampDiaUTC(ANO, MES, r.dia),
      _reflexao: paragrafo(r.reflexao),
      possui_meta_mes: 'true',
      _mes_titulo: META_MES_TITULO,
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
