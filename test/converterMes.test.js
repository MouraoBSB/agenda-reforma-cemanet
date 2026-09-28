import { test } from 'node:test';
import assert from 'node:assert/strict';
import { converterMarkdown, resolverSlug, titulo, frase } from '../src/converterMes.js';

const INFO_FEV = { ano: 2026, mes: 2, mesNome: 'Fevereiro' };

function documento(totalDias, { metaMes = 'DESENVOLVER A CARIDADE', extra = '' } = {}) {
  const dias = Array.from({ length: totalDias }, (_, i) => `## 📖 ${String(i + 1).padStart(2, '0')} de Fevereiro

**Reflexão e vivência em torno do Evangelho:**
“Texto *da* reflexão.” (Lucas, 1:${i + 1})

**Meta do mês:** ${metaMes}
“Citação do mês.” (Autor, *Livro*, 1. ed., p. 1).

**Meta do dia:** DESENVOLVER A RENÚNCIA NO LAR
Meta do dia ${i + 1}.

**Sugestão para a sua prece diária:**
Prece ${i + 1}.
${extra}`);
  return `# Agenda\n\n${dias.join('\n---\n\n')}`;
}

test('resolverSlug interpreta mês e ano', () => {
  assert.deepEqual(resolverSlug('outubro-2026'), { ano: 2026, mes: 10, mesNome: 'Outubro' });
  assert.deepEqual(resolverSlug('março-2027'), { ano: 2027, mes: 3, mesNome: 'Março' });
  assert.throws(() => resolverSlug('outubro'), /slug de mês inválido/);
});

test('titulo e frase normalizam caixa', () => {
  assert.equal(titulo('DESENVOLVER RENÚNCIA NO LAR'), 'Desenvolver Renúncia no Lar');
  assert.equal(frase('DESENVOLVER ABNEGAÇÃO, RENÚNCIA E SOLIDARIEDADE'), 'Desenvolver abnegação, renúncia e solidariedade');
});

test('converte documento completo, removendo itálico e campos extras', () => {
  const extra = '\n**Balanço do dia:**\n\n**Ações negativas: (EGOÍSMO)**  \n1.  \n2.';
  const dados = converterMarkdown(documento(28, { extra }), INFO_FEV);
  assert.equal(dados.metaMesTitulo, 'Desenvolver a caridade');
  assert.equal(dados.dias.length, 28);
  assert.deepEqual(dados.dias[0], {
    dia: 1,
    reflexao: '“Texto da reflexão.” (Lucas, 1:1)',
    metaMesTexto: '“Citação do mês.” (Autor, Livro, 1. ed., p. 1).',
    tituloMetaDia: 'Desenvolver a Renúncia no Lar',
    metaDia: 'Meta do dia 1.',
    prece: 'Prece 1.',
  });
});

test('rejeita dias faltando', () => {
  assert.throws(() => converterMarkdown(documento(27), INFO_FEV), /fora de sequência/);
});

test('rejeita meta do mês divergente entre dias', () => {
  const doc = documento(28).replace('DESENVOLVER A CARIDADE', 'OUTRA META');
  assert.throws(() => converterMarkdown(doc, INFO_FEV), /deve ser único/);
});
