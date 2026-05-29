// Agenda Reforma Íntima — cliente da WordPress REST API
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function criarCliente({ baseUrl, authHeader, tentativas = 2 }) {
  const base = `${baseUrl}/wp-json/wp/v2`;

  async function req(caminho, opcoes = {}) {
    const url = `${base}${caminho}`;
    const headers = { Authorization: authHeader, ...(opcoes.headers || {}) };
    let body = opcoes.body;
    if (body && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      body = Buffer.from(JSON.stringify(body), 'utf8');
    }
    let ultimoErro;
    for (let i = 0; i <= tentativas; i++) {
      try {
        const resp = await fetch(url, { ...opcoes, headers, body });
        const texto = await resp.text();
        const dados = texto ? JSON.parse(texto) : null;
        if (!resp.ok) {
          const erro = new Error(`HTTP ${resp.status}: ${dados?.message ?? texto}`);
          erro.status = resp.status;
          if (resp.status >= 500 && i < tentativas) { ultimoErro = erro; await espera(500 * (i + 1)); continue; }
          throw erro;
        }
        return dados;
      } catch (erro) {
        if (erro.status && erro.status < 500) throw erro;
        ultimoErro = erro;
        if (i < tentativas) await espera(500 * (i + 1));
      }
    }
    throw ultimoErro;
  }

  // Formata uma Date UTC como "YYYY-MM-DDThh:mm:ss" usando getters UTC.
  function formatarDataUTC(d, horaMin) {
    const ano = d.getUTCFullYear();
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dia = String(d.getUTCDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}T${horaMin}`;
  }

  return {
    usuarioAtual: () => req('/users/me?context=edit&_fields=id,slug'),
    listarMes: (ano, mes) => {
      const after  = formatarDataUTC(new Date(Date.UTC(ano, mes - 1, 0)), '23:59:59');
      const before = formatarDataUTC(new Date(Date.UTC(ano, mes, 1)), '00:00:00');
      return req(
        `/agenda-reforma?status=publish,future` +
        `&after=${after}&before=${before}` +
        `&per_page=100&context=edit&_fields=id,date,status,meta._dia_agenda`
      );
    },
    criar: (payload) => req('/agenda-reforma', { method: 'POST', body: payload }),
    atualizar: (id, payload) => req(`/agenda-reforma/${id}`, { method: 'POST', body: payload }),
    lerPost: (id) => req(`/agenda-reforma/${id}?context=edit&_fields=id,date,status,meta`)
  };
}
