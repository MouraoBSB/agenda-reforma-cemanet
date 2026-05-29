# Design — Carga da Agenda Reforma Íntima (junho/2026)

Data: 2026-05-29
Projeto: Cemanet — Agenda Reforma Íntima

## 1. Objetivo

Popular o post type *Agenda Reforma Íntima* (slug `agenda-reforma`, ID 164, criado com
JetEngine) do site `https://cemanet.org.br/` com o conteúdo diário de **junho/2026
(dias 01 a 30)**, via WordPress REST API, deixando cada post **agendado** para virar
publicado automaticamente na meia-noite do seu respectivo dia.

## 2. Fatos confirmados em produção (testes ao vivo)

- **Autenticação:** Basic Auth com login `agenda-reforma@cemanet.org.br` + senha de
  aplicativo → usuário id 179. Funciona em GET/POST/DELETE.
- **Endpoint:** `https://cemanet.org.br/wp-json/wp/v2/agenda-reforma`.
- **Timezone do site:** UTC-3 (Brasília). `date` (local) e `date_gmt` diferem em 3h.
- **Agendamento (padrão dos posts de maio 27086/27087):** `status=future` e
  `date` à meia-noite local (`00:00:00`).
- **Meta-fields do JetEngine:** só ficam graváveis/legíveis pelo REST após ligar
  "Show in REST API" em cada campo (já ativado pelo cliente). Confirmado: o campo
  `meta` passou a constar no schema do endpoint.
- **Formato real de cada campo** (lido do post 27087 = 31/05/2026):
  - `_dia_agenda`: inteiro, **timestamp da meia-noite UTC** do dia (ex.: 31/05/2026 →
    `1780185600`, divisível por 86400).
  - Switchers (`possui_meta_mes`, `possui_meta_dia`, `possui_imagem`, `possui_tema`):
    **strings** `"true"` / `"false"`.
  - Campos wysiwyg (`_reflexao`, `_mes_texto`, `_dia`, `_prece`): HTML, padrão
    `<p>...</p>`.
  - Títulos (`_mes_titulo`, `_titulo_meta_dia`): texto plano, caixa normal.

### Timestamps `_dia_agenda` de junho/2026 (validados)
- 01/06 = `1780272000` … 30/06 = `1782777600`.
- Fórmula: meia-noite UTC do dia → `Date.UTC(2026, 5, dia) / 1000`.

## 3. Decisões

- **Abordagem:** REST API padrão (`wp/v2`) com o campo `meta` (após "Show in REST API").
- **Linguagem:** Node.js (>= 18), sem dependências externas (`fetch` nativo).
- **Capitalização dos títulos:** caixa normal, seguindo o padrão do site.
  - `_mes_titulo` (fixo no mês): `"Combater o egoísmo: indiferença e ingratidão"`.
  - `_titulo_meta_dia`: Title Case, ex.: `"Combater a Indiferença"`,
    `"Combater a Indiferença no Lar"`, `"Combater a Indiferença ante o Próximo"`,
    `"Combater a Indiferença ao Semelhante"`, `"Combater a Ingratidão"`,
    `"Combater a Ingratidão no Lar"`.
- **Título do post (`title`):** `"01 de Junho de 2026"` (apenas para visualização no admin).
- **Status:** `future` (agendado), nunca `publish` direto.
- **Segurança de execução:** o script roda em **modo simulação (`--simular`) por padrão**;
  só grava no site com a flag explícita **`--executar`**.

## 4. Estrutura de arquivos

```
Cemanet - Agenda Reforma Íntima/
├── dados/
│   └── junho-2026.json      # os 30 dias estruturados (revisável pelo cliente)
├── src/
│   ├── config.js            # carrega credenciais e baseURL de config.local.json
│   ├── wpClient.js          # cliente REST (auth Basic, GET/POST, retry, UTF-8)
│   ├── montarPayload.js     # transforma 1 registro de dia → payload do WordPress
│   └── index.js             # orquestra: valida, checa duplicados, cria, valida
├── config.local.json        # credenciais (arquivo separado, fora de versionamento)
└── package.json
```

## 5. Formato de `dados/junho-2026.json`

Lista de 30 objetos, um por dia:

```json
{
  "dia": 1,
  "reflexao": "“Se alguém te bater numa face...” (Lucas, 6: 29).",
  "metaMesTexto": "“Oh! meus amigos...” (Allan Kardec, O Evangelho..., item 13).",
  "tituloMetaDia": "Combater a Indiferença",
  "metaDia": "Enternecer-se ante o sofrimento do próximo.",
  "prece": "Prece em favor dos desesperados e cansados do caminho."
}
```

Campos fixos no mês (não repetidos no JSON, aplicados no `montarPayload`):
`_mes_titulo`, `possui_meta_mes="true"`, `possui_meta_dia="true"`,
`possui_imagem="false"`, `possui_tema="false"`, `_imagem/_texto_imagem/_tema=""`.

## 6. Mapeamento campo a campo (por dia)

| Destino | Valor |
|---|---|
| `title` | `"{dia} de Junho de 2026"` |
| `status` | `"future"` |
| `date` | `"2026-06-{dd}T00:00:00"` (meia-noite local) |
| `meta._dia_agenda` | meia-noite UTC do dia (inteiro) |
| `meta._reflexao` | `<p>` + `reflexao` + `</p>` |
| `meta.possui_meta_mes` | `"true"` |
| `meta._mes_titulo` | `"Combater o egoísmo: indiferença e ingratidão"` |
| `meta._mes_texto` | `<p>` + `metaMesTexto` + `</p>` |
| `meta.possui_meta_dia` | `"true"` |
| `meta._titulo_meta_dia` | `tituloMetaDia` |
| `meta._dia` | `<p>` + `metaDia` + `</p>` |
| `meta._prece` | `<p>` + `prece` + `</p>` |
| `meta.possui_imagem` | `"false"` |
| `meta.possui_tema` | `"false"` |
| `meta._imagem` / `_texto_imagem` / `_tema` | `""` |

## 7. Fluxo de execução (`index.js`)

1. Valida ambiente (Node >= 18) e carrega `config.local.json`.
2. Testa autenticação (`GET /users/me`); aborta com mensagem clara se 401.
3. Carrega e valida `dados/junho-2026.json` (30 itens; obrigatórios não vazios:
   `reflexao`, `prece`, `tituloMetaDia`, `metaDia`, `metaMesTexto`).
4. **Idempotência:** `GET` posts de junho/2026 (`status=publish,future`, intervalo de
   datas `2026-05-31T23:59:59`–`2026-07-01T00:00:00`, `per_page=100`); monta conjunto
   dos dias já existentes pela `date`.
5. Para cada dia: se já existe → **pula** (log); senão → monta payload e **cria** (POST).
   - Em `--simular`: imprime o payload/decisão, sem POST.
6. **Validação pós-criação** (apenas em `--executar`): relê cada post criado
   (`context=edit`) e confere `_dia_agenda` e `_titulo_meta_dia`.
7. **Log estruturado pt-BR** + resumo final: criados / pulados / erros (com detalhe).

## 8. Tratamento de erros e robustez

- Envio sempre em UTF-8 (`Content-Type: application/json; charset=utf-8`), preservando
  acentuação e aspas tipográficas “ ”.
- HTML gerado é limpo (`<p>…</p>`); não reproduz lixo de CSS observado em posts de maio.
- Falha em um dia não interrompe os demais: registra erro (com corpo da resposta) e
  segue; o resumo final lista as falhas para reprocessamento.
- Retry leve (até 2 tentativas, backoff) em erros de rede/5xx.
- Credenciais ficam em `config.local.json` (separado do código).

## 9. Fora de escopo

- Campos de imagem (`_imagem`, `_texto_imagem`) e tema (`_tema`): não há conteúdo no
  material de junho; ficam vazios e os switches em `"false"`.
- Outros meses: a arquitetura é reutilizável (basta novo arquivo de dados), mas a carga
  de outros meses não faz parte desta entrega.
