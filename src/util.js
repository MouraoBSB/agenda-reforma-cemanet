// Agenda Reforma Íntima — utilitários puros
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

// Timestamp Unix (segundos) da meia-noite UTC do dia informado.
// mes em base 1 (junho = 6). Replica o formato gravado pelo JetEngine
// no campo date "is_timestamp" (meia-noite UTC).
export function timestampDiaUTC(ano, mes, dia) {
  return Date.UTC(ano, mes - 1, dia) / 1000;
}

// Envolve um texto em um parágrafo HTML, como esperado pelos campos wysiwyg.
export function paragrafo(texto) {
  return `<p>${texto}</p>`;
}
