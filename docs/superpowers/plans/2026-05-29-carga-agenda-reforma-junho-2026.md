# Carga da Agenda Reforma Íntima (junho/2026) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar 30 posts agendados (`status=future`) do post type `agenda-reforma` no site cemanet.org.br, um por dia de junho/2026, preenchendo os meta-fields do JetEngine via WordPress REST API.

**Architecture:** Script Node.js (>= 18, sem dependências externas, `fetch` nativo). Dados separados da lógica: o conteúdo dos 30 dias fica em `dados/junho-2026.json`; módulos puros (`config`, `util`, `montarPayload`) são testados com `node:test`; `wpClient` encapsula o REST; `index.js` orquestra com modo simulação por padrão.

**Tech Stack:** Node.js >= 18 (ESM), `node:test` + `node:assert`, WordPress REST API (`wp/v2`), Basic Auth com senha de aplicativo.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json` | Metadados, `type: module`, scripts de teste/execução |
| `.gitignore` | Ignorar `config.local.json` e `node_modules` |
| `config.local.example.json` | Modelo de credenciais (versionável) |
| `config.local.json` | Credenciais reais (NÃO versionado) |
| `src/config.js` | Carregar e validar config; montar header Basic |
| `src/util.js` | `timestampDiaUTC`, `paragrafo` (funções puras) |
| `src/montarPayload.js` | `validarRegistro`, `montarPayload` (1 dia → payload WP) |
| `src/wpClient.js` | Cliente REST (auth, GET/POST, retry, UTF-8) |
| `src/index.js` | Orquestrador (`--simular` padrão / `--executar`) |
| `dados/junho-2026.json` | Os 30 dias estruturados |
| `test/util.test.js` | Testes de `util.js` |
| `test/montarPayload.test.js` | Testes de `montarPayload.js` |
| `test/config.test.js` | Testes de `config.js` |
| `test/wpClient.test.js` | Testes de `wpClient.js` (fetch mockado) |
| `test/dados.test.js` | Integridade do `dados/junho-2026.json` |

---

## Task 1: Inicializar projeto e versionamento

**Files:**
- Create: `package.json`, `.gitignore`, `config.local.example.json`

- [ ] **Step 1: Inicializar git**

Run:
```bash
git init
git config user.name "Thiago Mourão"
git config user.email "tobrasil@gmail.com"
```
Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Criar `package.json`**

```json
{
  "name": "agenda-reforma-intima",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Carga de conteúdo do post type Agenda Reforma Íntima (cemanet.org.br) via WordPress REST API.",
  "engines": { "node": ">=18" },
  "scripts": {
    "test": "node --test",
    "simular": "node src/index.js --simular",
    "executar": "node src/index.js --executar"
  },
  "author": "Thiago Mourão (https://github.com/MouraoBSB)"
}
```

- [ ] **Step 3: Criar `.gitignore`**

```gitignore
node_modules/
config.local.json
```

- [ ] **Step 4: Criar `config.local.example.json`**

```json
{
  "baseUrl": "https://cemanet.org.br/",
  "usuario": "agenda-reforma@cemanet.org.br",
  "senhaApp": "COLE_AQUI_A_SENHA_DE_APLICATIVO"
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore config.local.example.json
git commit -m "chore: inicializa projeto Node.js sem dependências"
```

---

## Task 2: Utilitários puros (`util.js`)

**Files:**
- Create: `src/util.js`
- Test: `test/util.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`test/util.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timestampDiaUTC, paragrafo } from '../src/util.js';

test('timestampDiaUTC retorna meia-noite UTC em segundos', () => {
  // valores validados contra o post real de maio (31/05/2026 = 1780185600)
  assert.equal(timestampDiaUTC(2026, 5, 31), 1780185600);
  assert.equal(timestampDiaUTC(2026, 6, 1), 1780272000);
  assert.equal(timestampDiaUTC(2026, 6, 30), 1782777600);
});

test('timestampDiaUTC retorna inteiro', () => {
  assert.ok(Number.isInteger(timestampDiaUTC(2026, 6, 15)));
});

test('paragrafo envolve o texto em <p>', () => {
  assert.equal(paragrafo('Olá'), '<p>Olá</p>');
});

test('paragrafo preserva acentos e aspas tipográficas', () => {
  assert.equal(paragrafo('“coração”'), '<p>“coração”</p>');
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test test/util.test.js`
Expected: FAIL — `Cannot find module '../src/util.js'`.

- [ ] **Step 3: Implementar `src/util.js`**

```js
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
```

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `node --test test/util.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/util.js test/util.test.js
git commit -m "feat: utilitários de timestamp UTC e parágrafo HTML"
```

---

## Task 3: Montagem do payload (`montarPayload.js`)

**Files:**
- Create: `src/montarPayload.js`
- Test: `test/montarPayload.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`test/montarPayload.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarPayload, validarRegistro } from '../src/montarPayload.js';

const registroValido = {
  dia: 1,
  reflexao: '“Se alguém te bater numa face...” (Lucas, 6: 29).',
  metaMesTexto: '“Oh! meus amigos...” (Allan Kardec, item 13).',
  tituloMetaDia: 'Combater a Indiferença',
  metaDia: 'Enternecer-se ante o sofrimento do próximo.',
  prece: 'Prece em favor dos desesperados e cansados do caminho.'
};

test('validarRegistro não acusa erros em registro completo', () => {
  assert.deepEqual(validarRegistro(registroValido), []);
});

test('validarRegistro acusa campos vazios e dia inválido', () => {
  const erros = validarRegistro({ dia: 0, reflexao: '', metaMesTexto: 'x', tituloMetaDia: 'x', metaDia: 'x', prece: '' });
  assert.ok(erros.some(e => e.includes('dia')));
  assert.ok(erros.some(e => e.includes('reflexao')));
  assert.ok(erros.some(e => e.includes('prece')));
});

test('montarPayload gera title, status e date corretos', () => {
  const p = montarPayload(registroValido);
  assert.equal(p.title, '01 de Junho de 2026');
  assert.equal(p.status, 'future');
  assert.equal(p.date, '2026-06-01T00:00:00');
});

test('montarPayload preenche meta com formatos do JetEngine', () => {
  const p = montarPayload(registroValido);
  assert.equal(p.meta._dia_agenda, 1780272000);
  assert.equal(p.meta._reflexao, '<p>“Se alguém te bater numa face...” (Lucas, 6: 29).</p>');
  assert.equal(p.meta.possui_meta_mes, 'true');
  assert.equal(p.meta._mes_titulo, 'Combater o egoísmo: indiferença e ingratidão');
  assert.equal(p.meta._mes_texto, '<p>“Oh! meus amigos...” (Allan Kardec, item 13).</p>');
  assert.equal(p.meta.possui_meta_dia, 'true');
  assert.equal(p.meta._titulo_meta_dia, 'Combater a Indiferença');
  assert.equal(p.meta._dia, '<p>Enternecer-se ante o sofrimento do próximo.</p>');
  assert.equal(p.meta._prece, '<p>Prece em favor dos desesperados e cansados do caminho.</p>');
  assert.equal(p.meta.possui_imagem, 'false');
  assert.equal(p.meta.possui_tema, 'false');
  assert.equal(p.meta._imagem, '');
  assert.equal(p.meta._texto_imagem, '');
  assert.equal(p.meta._tema, '');
});

test('montarPayload formata o dia 30 com timestamp correto', () => {
  const p = montarPayload({ ...registroValido, dia: 30 });
  assert.equal(p.title, '30 de Junho de 2026');
  assert.equal(p.date, '2026-06-30T00:00:00');
  assert.equal(p.meta._dia_agenda, 1782777600);
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test test/montarPayload.test.js`
Expected: FAIL — `Cannot find module '../src/montarPayload.js'`.

- [ ] **Step 3: Implementar `src/montarPayload.js`**

```js
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
```

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `node --test test/montarPayload.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/montarPayload.js test/montarPayload.test.js
git commit -m "feat: validação e montagem do payload por dia"
```

---

## Task 4: Transcrever o conteúdo (`dados/junho-2026.json`)

**Files:**
- Create: `dados/junho-2026.json`
- Test: `test/dados.test.js`

**Fonte:** `Material para lançar/Junho-2026.pdf` (dias 01 a 30). Para cada dia, extrair:
- `reflexao` ← bloco "Reflexão e vivência em torno do Evangelho" (versículo + referência).
- `metaMesTexto` ← a citação que segue "Meta do mês:" (NÃO o título fixo).
- `tituloMetaDia` ← o texto de "Meta do dia:" convertido para Title Case (caixa normal),
  ex.: "COMBATER A INDIFERENÇA" → "Combater a Indiferença";
  "COMBATER A INDIFERENÇA NO LAR" → "Combater a Indiferença no Lar"
  (preposições/artigos em minúscula: no, ao, ante, o, a, e).
- `metaDia` ← a ação prática que segue o título da meta do dia.
- `prece` ← bloco "Sugestão para a sua prece diária".

- [ ] **Step 1: Escrever o teste de integridade que falha**

`test/dados.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validarRegistro } from '../src/montarPayload.js';

const dados = JSON.parse(await readFile(new URL('../dados/junho-2026.json', import.meta.url), 'utf8'));

test('contém exatamente 30 dias, de 1 a 30, sem repetição', () => {
  assert.equal(dados.length, 30);
  const dias = dados.map(d => d.dia).sort((a, b) => a - b);
  assert.deepEqual(dias, Array.from({ length: 30 }, (_, i) => i + 1));
});

test('todos os registros são válidos (campos obrigatórios preenchidos)', () => {
  for (const r of dados) {
    assert.deepEqual(validarRegistro(r), [], `dia ${r.dia} inválido`);
  }
});

test('títulos do dia estão em caixa normal (não tudo maiúsculo)', () => {
  for (const r of dados) {
    assert.notEqual(r.tituloMetaDia, r.tituloMetaDia.toUpperCase(), `dia ${r.dia} em caixa alta`);
  }
});

test('campos não contêm HTML/CSS residual', () => {
  for (const r of dados) {
    for (const campo of ['reflexao', 'metaMesTexto', 'metaDia', 'prece']) {
      assert.ok(!/<\/?(p|section|div|span)\b/i.test(r[campo]), `dia ${r.dia} campo ${campo} contém HTML`);
    }
  }
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test test/dados.test.js`
Expected: FAIL — `ENOENT` (arquivo de dados ausente).

- [ ] **Step 3: Criar `dados/junho-2026.json`**

Transcrever os 30 dias do PDF. Início concreto (dias 01–03) como referência de formato:
```json
[
  {
    "dia": 1,
    "reflexao": "“Se alguém te bater numa face, apresenta-lhe a outra; se alguém te tirar a capa, não o impeças de levar também a túnica.” (Lucas, 6: 29).",
    "metaMesTexto": "“Oh! meus amigos, que de misérias, que de lágrimas, quanto tendes de fazer para secá-las todas! [...]” (Allan Kardec, O Evangelho segundo o Espiritismo, 113. ed., cap. XIII, item 13).",
    "tituloMetaDia": "Combater a Indiferença",
    "metaDia": "Enternecer-se ante o sofrimento do próximo.",
    "prece": "Prece em favor dos desesperados e cansados do caminho."
  },
  {
    "dia": 2,
    "reflexao": "“Dá a todo o que pedir; e ao que te tomar os teus bens não os reclames.” (Lucas, 6: 30).",
    "metaMesTexto": "“[...] não procedais como esses egoístas endurecidos que se afastam dos aflitos, porque o espetáculo de suas misérias lhes perturbaria por instantes a existência álacre.” (Allan Kardec, O Evangelho segundo o Espiritismo, 113. ed., cap. XIII, item 17).",
    "tituloMetaDia": "Combater a Indiferença",
    "metaDia": "Procure interessar-se pela dor alheia, levando consolo e resignação.",
    "prece": "Prece rogando amparo a todos os que perderam a esperança."
  },
  {
    "dia": 3,
    "reflexao": "“Fazei aos homens o que quereis que eles vos façam.” (Lucas, 6: 31).",
    "metaMesTexto": "“Temei conservar-vos indiferentes, quando puderdes ser úteis.” (Allan Kardec, O Evangelho segundo o Espiritismo, 113. ed., cap. XIII, item 17).",
    "tituloMetaDia": "Combater a Indiferença",
    "metaDia": "Combater a indiferença pelo devotamento ao semelhante, especialmente os mais necessitados.",
    "prece": "Prece rogando o desenvolvimento do sentimento da compaixão."
  }
]
```
Continuar com os dias 04–30, transcrevendo fielmente do PDF. Títulos do dia esperados
(referência de Title Case): dias 1–6 "Combater a Indiferença"; 7–9 "Combater a Indiferença
no Lar"; 10 "Combater a Indiferença ante o Próximo"; 11–12 "Combater a Indiferença ao
Semelhante"; 13–15 "Combater a Indiferença"; 16–26 "Combater a Ingratidão"; 27–28
"Combater a Ingratidão no Lar"; 29–30 "Combater a Ingratidão".

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `node --test test/dados.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add dados/junho-2026.json test/dados.test.js
git commit -m "feat: conteúdo estruturado de junho/2026 (30 dias)"
```

---

## Task 5: Carregar configuração (`config.js`)

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`test/config.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarConfig } from '../src/config.js';

test('carrega config válida e monta header Basic', async () => {
  const caminho = join(tmpdir(), `cfg-ok-${process.pid}.json`);
  await writeFile(caminho, JSON.stringify({ baseUrl: 'https://x.org/', usuario: 'u@x.org', senhaApp: 'a b c' }), 'utf8');
  const cfg = await carregarConfig(caminho);
  assert.equal(cfg.baseUrl, 'https://x.org'); // sem barra final
  assert.equal(cfg.authHeader, 'Basic ' + Buffer.from('u@x.org:a b c', 'utf8').toString('base64'));
  await rm(caminho);
});

test('falha quando falta campo obrigatório', async () => {
  const caminho = join(tmpdir(), `cfg-bad-${process.pid}.json`);
  await writeFile(caminho, JSON.stringify({ baseUrl: 'https://x.org' }), 'utf8');
  await assert.rejects(() => carregarConfig(caminho), /usuario/);
  await rm(caminho);
});

test('mensagem clara quando arquivo não existe', async () => {
  await assert.rejects(() => carregarConfig(join(tmpdir(), 'nao-existe-xyz.json')), /não encontrado/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../src/config.js'`.

- [ ] **Step 3: Implementar `src/config.js`**

```js
// Agenda Reforma Íntima — carregamento de configuração
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAMINHO_PADRAO = join(RAIZ, 'config.local.json');

export async function carregarConfig(caminho = CAMINHO_PADRAO) {
  let bruto;
  try {
    bruto = await readFile(caminho, 'utf8');
  } catch {
    throw new Error(
      `Arquivo de configuração não encontrado: ${caminho}. ` +
      'Copie config.local.example.json para config.local.json e preencha as credenciais.'
    );
  }
  const cfg = JSON.parse(bruto);
  for (const campo of ['baseUrl', 'usuario', 'senhaApp']) {
    if (!cfg[campo] || typeof cfg[campo] !== 'string' || !cfg[campo].trim()) {
      throw new Error(`Configuração inválida: campo "${campo}" ausente ou vazio em ${caminho}.`);
    }
  }
  cfg.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
  cfg.authHeader = 'Basic ' + Buffer.from(`${cfg.usuario}:${cfg.senhaApp}`, 'utf8').toString('base64');
  return cfg;
}
```

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `node --test test/config.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Criar `config.local.json` real (não versionado)**

```json
{
  "baseUrl": "https://cemanet.org.br/",
  "usuario": "agenda-reforma@cemanet.org.br",
  "senhaApp": "COLE_AQUI_A_SENHA_DE_APLICATIVO"
}
```
(Confirmar que `.gitignore` já ignora este arquivo: `git status` não deve listá-lo.)

- [ ] **Step 6: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: carregamento e validação de configuração"
```

---

## Task 6: Cliente REST (`wpClient.js`)

**Files:**
- Create: `src/wpClient.js`
- Test: `test/wpClient.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`test/wpClient.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarCliente } from '../src/wpClient.js';

function mockFetch(respostas) {
  const chamadas = [];
  global.fetch = async (url, opts) => {
    chamadas.push({ url, opts });
    const r = respostas.shift();
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body === undefined ? '' : JSON.stringify(r.body))
    };
  };
  return chamadas;
}

const cliente = criarCliente({ baseUrl: 'https://x.org', authHeader: 'Basic abc' });

test('criar envia POST com Authorization e Content-Type UTF-8', async () => {
  const chamadas = mockFetch([{ status: 201, body: { id: 99 } }]);
  const r = await cliente.criar({ title: 'Olá', meta: { _x: 'ção' } });
  assert.equal(r.id, 99);
  const c = chamadas[0];
  assert.equal(c.url, 'https://x.org/wp-json/wp/v2/agenda-reforma');
  assert.equal(c.opts.method, 'POST');
  assert.equal(c.opts.headers.Authorization, 'Basic abc');
  assert.match(c.opts.headers['Content-Type'], /charset=utf-8/);
});

test('erro 4xx lança imediatamente sem retry', async () => {
  const chamadas = mockFetch([{ status: 400, body: { message: 'inválido' } }]);
  await assert.rejects(() => cliente.criar({}), /HTTP 400.*inválido/);
  assert.equal(chamadas.length, 1);
});

test('erro 5xx faz retry e depois sucesso', async () => {
  const chamadas = mockFetch([{ status: 503, body: { message: 'indisp' } }, { status: 201, body: { id: 7 } }]);
  const r = await cliente.criar({});
  assert.equal(r.id, 7);
  assert.equal(chamadas.length, 2);
});

test('listarJunho monta query com intervalo e status', async () => {
  const chamadas = mockFetch([{ status: 200, body: [] }]);
  await cliente.listarJunho();
  assert.match(chamadas[0].url, /status=publish,future/);
  assert.match(chamadas[0].url, /after=2026-05-31T23:59:59/);
  assert.match(chamadas[0].url, /before=2026-07-01T00:00:00/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test test/wpClient.test.js`
Expected: FAIL — `Cannot find module '../src/wpClient.js'`.

- [ ] **Step 3: Implementar `src/wpClient.js`**

```js
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

  return {
    usuarioAtual: () => req('/users/me?context=edit&_fields=id,slug'),
    listarJunho: () => req(
      '/agenda-reforma?status=publish,future' +
      '&after=2026-05-31T23:59:59&before=2026-07-01T00:00:00' +
      '&per_page=100&context=edit&_fields=id,date,status'
    ),
    criar: (payload) => req('/agenda-reforma', { method: 'POST', body: payload }),
    lerPost: (id) => req(`/agenda-reforma/${id}?context=edit&_fields=id,date,status,meta`)
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar sucesso**

Run: `node --test test/wpClient.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/wpClient.js test/wpClient.test.js
git commit -m "feat: cliente REST com retry e envio UTF-8"
```

---

## Task 7: Orquestrador (`index.js`)

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Implementar `src/index.js`**

```js
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
  const simular = !executar; // padrão: simulação
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

  // 3) Idempotência: dias de junho já existentes
  const existentes = await cliente.listarJunho();
  const diasExistentes = new Set(
    existentes.map((p) => diaDaData(p.date)).filter((d) => d && d.mes === 6).map((d) => d.dia)
  );
  if (diasExistentes.size) log(`Já existem ${diasExistentes.size} dia(s) de junho: ${[...diasExistentes].sort((a,b)=>a-b).join(', ')}.`);

  // 4) Criar
  const resumo = { criados: [], pulados: [], erros: [] };
  for (const r of dados) {
    if (diasExistentes.has(r.dia)) { resumo.pulados.push(r.dia); log(`dia ${r.dia}: já existe, pulando.`); continue; }
    const payload = montarPayload(r);
    if (simular) {
      log(`dia ${r.dia}: [simulado] criaria "${payload.title}" date=${payload.date} _dia_agenda=${payload.meta._dia_agenda} titulo_dia="${payload.meta._titulo_meta_dia}".`);
      resumo.criados.push(r.dia);
      continue;
    }
    try {
      const novo = await cliente.criar(payload);
      // 5) validação pós-criação
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
  }

  // 6) Resumo
  log('===== RESUMO =====');
  log(`Criados${simular ? ' (simulados)' : ''}: ${resumo.criados.length} (${resumo.criados.join(', ') || '-'})`);
  log(`Pulados (já existiam): ${resumo.pulados.length} (${resumo.pulados.join(', ') || '-'})`);
  log(`Erros: ${resumo.erros.length}`);
  resumo.erros.forEach((e) => log(`  - dia ${e.dia}: ${e.msg}`));
  if (resumo.erros.length) process.exitCode = 1;
}

principal().catch((e) => { console.error(`[agenda] FALHA: ${e.stack || e.message}`); process.exitCode = 1; });
```

- [ ] **Step 2: Rodar a suíte completa**

Run: `node --test`
Expected: PASS em todos os arquivos de teste.

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: orquestrador com modo simulação e validação pós-criação"
```

---

## Task 8: Execução em simulação (revisão do cliente)

**Files:** nenhum (execução)

- [ ] **Step 1: Rodar em modo simulação**

Run: `npm run simular`
Expected: autentica; lista 30 dias; informa que nenhum dia de junho existe; imprime 30 linhas "[simulado] criaria ..." com títulos e timestamps; resumo "Criados (simulados): 30".

- [ ] **Step 2: Conferir o log**

Verificar manualmente, na saída, alguns dias (01, 10, 27, 30): título, `date`, `_dia_agenda`
e `_titulo_meta_dia` corretos. Ajustar `dados/junho-2026.json` se algo estiver errado e
repetir o Step 1. **Checkpoint de revisão com o cliente antes da carga real.**

---

## Task 9: Carga real e verificação

**Files:** nenhum (execução)

- [ ] **Step 1: Executar a carga real**

Run: `npm run executar`
Expected: 30 linhas "dia N: criado e validado (id=...)"; resumo "Criados: 30 / Pulados: 0 / Erros: 0".

- [ ] **Step 2: Verificar idempotência**

Run: `npm run executar`
Expected: "dia N: já existe, pulando." para todos; resumo "Criados: 0 / Pulados: 30".

- [ ] **Step 3: Conferência no painel WordPress**

Conferir em **WP Admin → Agenda Reforma Íntima** que os 30 posts de junho aparecem como
**Agendados**, com os campos preenchidos (abrir o dia 01 e o dia 30 para checar).

- [ ] **Step 4: Commit final (estado do projeto)**

```bash
git add -A
git commit -m "chore: carga de junho/2026 concluída"
```

---

## Self-Review (cobertura do spec)

- Autenticação, endpoint, timezone → Task 5/6/7.
- Formatos reais (`_dia_agenda` UTC, switchers string, wysiwyg `<p>`) → Task 2/3 (testes com valores validados).
- Mapeamento campo a campo → Task 3.
- Idempotência por intervalo de datas → Task 6/7.
- Modo simulação padrão + `--executar` → Task 7/8/9.
- HTML limpo / UTF-8 / retry / erro não derruba lote → Task 2/3/6/7.
- Conteúdo dos 30 dias + integridade → Task 4.
- Credenciais separadas e fora de versionamento → Task 1/5.
