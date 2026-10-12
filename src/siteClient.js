// Agenda Reforma Íntima — cliente da API da Agenda do site (cemanet.org.br/api/v1)
// Thiago Mourão — https://github.com/MouraoBSB — 2026-10-12

const REENVIAVEIS = new Set([409, 429, 500, 502, 503]);
const ESPERAS_PADRAO_MS = [5000, 15000, 30000];
const ESPERA_MAXIMA_MS = 120000;
const TEMPO_LIMITE_MS = 30000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export class ErroApi extends Error {
  constructor(status, corpo) {
    const codigo = corpo?.erro?.codigo ?? null;
    const mensagem = corpo?.erro?.mensagem ?? 'resposta sem corpo da API';
    super(`HTTP ${status}${codigo ? ` (${codigo})` : ''}: ${mensagem}`);
    this.name = 'ErroApi';
    this.status = status;
    this.codigo = codigo;
    this.dias = Array.isArray(corpo?.dias) ? corpo.dias : [];
  }
}

function lerJson(texto) {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null; // 502/503 do proxy chegam sem o corpo da API
  }
}

// Espera pedida pelo servidor (Retry-After, em segundos) ou a progressiva padrão.
function calcularEspera(resposta, tentativa, esperasMs) {
  const segundos = Number(resposta?.headers?.get?.('Retry-After'));
  if (Number.isFinite(segundos) && segundos > 0) return Math.min(segundos * 1000, ESPERA_MAXIMA_MS);
  return esperasMs[Math.min(tentativa, esperasMs.length - 1)];
}

export function criarCliente({ baseUrl, chave, buscar = fetch, esperar = dormir, esperasMs = ESPERAS_PADRAO_MS, aoReenviar = () => {} }) {
  async function req(metodo, caminho, corpo) {
    const headers = { Authorization: `Bearer ${chave}`, Accept: 'application/json' };
    let body;
    if (corpo !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      body = Buffer.from(JSON.stringify(corpo), 'utf8');
    }

    for (let tentativa = 0; ; tentativa++) {
      let resposta;
      let erro;
      try {
        resposta = await buscar(`${baseUrl}${caminho}`, { method: metodo, headers, body, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
        const dados = lerJson(await resposta.text());
        if (resposta.ok) return dados;
        erro = new ErroApi(resposta.status, dados);
      } catch (falha) {
        erro = new Error(`falha de rede em ${metodo} ${caminho}: ${falha.message}`);
      }

      // 4xx fora da lista nunca é reenviado; 500 só uma vez; rede e demais até o fim das esperas.
      const reenviavel = !erro.status || REENVIAVEIS.has(erro.status);
      const limite = erro.status === 500 ? 1 : esperasMs.length;
      if (!reenviavel || tentativa >= limite) throw erro;
      const ms = calcularEspera(resposta, tentativa, esperasMs);
      aoReenviar({ erro: erro.message, ms });
      await esperar(ms);
    }
  }

  return {
    quemSou: () => req('GET', '/eu'),
    lerMes: (ano, mes) => req('GET', `/agenda/meses/${ano}/${mes}`),
    gravarMes: (ano, mes, corpo) => req('PUT', `/agenda/meses/${ano}/${mes}`, corpo)
  };
}
