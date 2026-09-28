// Agenda Reforma Íntima — conversão do documento mensal revisado (.md) em dados/<mes>-<ano>.json
// Thiago Mourão — https://github.com/MouraoBSB — 2026-09-28

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const PALAVRAS_MENORES = new Set(['a', 'o', 'as', 'os', 'ao', 'aos', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para', 'com', 'sem',
  'sob', 'sobre', 'ante', 'e', 'umas', 'uns']);

const ROTULOS = [
  ['**Reflexão e vivência em torno do Evangelho:**', 'reflexao'],
  ['**Meta do mês:**', 'metaMes'],
  ['**Meta do dia:**', 'metaDia'],
  ['**Sugestão para a sua prece diária:**', 'prece'],
];

// "DESENVOLVER A RENÚNCIA" -> "Desenvolver a Renúncia"
export function titulo(str) {
  return str.toLowerCase().split(/\s+/).map((p, i) =>
    (i === 0 || !PALAVRAS_MENORES.has(p)) ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(' ');
}

// "COMBATER O EGOÍSMO: INVEJA" -> "Combater o egoísmo: inveja"
export function frase(str) {
  const minusculo = str.trim().toLowerCase();
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1);
}

function limpar(texto) {
  return texto.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

// Resolve "outubro-2026" em { ano, mes, mesNome }.
export function resolverSlug(slug) {
  const m = /^([a-zç]+)-(\d{4})$/.exec(slug ?? '');
  const indice = m ? MESES.findIndex((n) => n.toLowerCase() === m[1]) : -1;
  if (indice < 0) {
    throw new Error(`slug de mês inválido: "${slug}". Formato esperado: outubro-2026`);
  }
  return { ano: Number(m[2]), mes: indice + 1, mesNome: MESES[indice] };
}

// Converte o conteúdo do documento mensal no objeto de dados. Lança erro em qualquer inconsistência.
export function converterMarkdown(conteudo, { ano, mes, mesNome }) {
  const blocos = conteudo.split(/^## 📖\s*/m).slice(1);
  const erros = [];
  const titulosMes = new Set();
  const dias = [];

  for (const bloco of blocos) {
    const linhas = bloco.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const cab = new RegExp(`^(\\d{1,2}) de ${mesNome}$`, 'i').exec(linhas[0]);
    if (!cab) {
      erros.push(`cabeçalho inesperado: "${linhas[0]}"`);
      continue;
    }
    const dia = Number(cab[1]);
    const campos = { reflexao: '', metaMes: '', metaDia: '', prece: '' };
    let tituloMetaDia = '';
    let secao = null;

    for (const linha of linhas.slice(1)) {
      if (linha.startsWith('---')) continue;
      const rotulo = ROTULOS.find(([r]) => linha.startsWith(r));
      if (rotulo) {
        secao = rotulo[1];
        const resto = linha.slice(rotulo[0].length).trim();
        if (secao === 'metaMes') titulosMes.add(frase(resto));
        else if (secao === 'metaDia') tituloMetaDia = titulo(resto);
        else if (resto) campos[secao] += ` ${resto}`;
        continue;
      }
      // Qualquer outro rótulo em negrito (ex.: Balanço do dia) encerra a seção atual e é descartado.
      if (/^\*\*[^*]+:\*\*/.test(linha)) {
        secao = null;
        continue;
      }
      if (secao) campos[secao] += ` ${linha}`;
    }

    const registro = {
      dia,
      reflexao: limpar(campos.reflexao),
      metaMesTexto: limpar(campos.metaMes),
      tituloMetaDia,
      metaDia: limpar(campos.metaDia),
      prece: limpar(campos.prece),
    };
    for (const [campo, valor] of Object.entries(registro)) {
      if (valor === '') erros.push(`dia ${dia}: campo "${campo}" vazio`);
    }
    dias.push(registro);
  }

  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const numeros = dias.map((d) => d.dia).join(',');
  const esperado = Array.from({ length: totalDias }, (_, i) => i + 1).join(',');
  if (numeros !== esperado) erros.push(`dias fora de sequência 1..${totalDias}: [${numeros}]`);
  if (titulosMes.size !== 1) erros.push(`título da meta do mês deve ser único; encontrados: ${[...titulosMes].join(' | ') || 'nenhum'}`);

  if (erros.length) {
    throw new Error(`documento de ${mesNome}/${ano} inválido:\n  - ${erros.join('\n  - ')}`);
  }
  return { ano, mes, mesNome, metaMesTitulo: [...titulosMes][0], dias };
}

async function principal() {
  const slug = process.argv[2];
  const info = resolverSlug(slug);
  const origem = join(RAIZ, 'Meses', String(info.ano), info.mesNome,
    `Agenda de Reforma Íntima — ${info.mesNome} de ${info.ano}.md`);
  const destino = join(RAIZ, 'dados', `${slug}.json`);

  const dados = converterMarkdown(await readFile(origem, 'utf8'), info);
  await writeFile(destino, `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
  console.log(`[converter] ${dados.dias.length} dias gravados em dados/${slug}.json (meta do mês: "${dados.metaMesTitulo}").`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => { console.error(`[converter] ERRO: ${e.message}`); process.exitCode = 1; });
}
