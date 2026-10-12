// Agenda Reforma Íntima — carregamento de configuração
// Thiago Mourão — https://github.com/MouraoBSB — 2026-05-29

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAMINHO_ENV = join(RAIZ, '.env');

// Lê CEMA_API_URL e CEMA_API_CHAVE. arquivoEnv = null ignora o arquivo (usado nos testes).
export function carregarConfig({ arquivoEnv = CAMINHO_ENV, env = process.env } = {}) {
  if (arquivoEnv && existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

  const url = (env.CEMA_API_URL ?? '').trim();
  const chave = (env.CEMA_API_CHAVE ?? '').trim();
  if (!url) {
    throw new Error('Configuração inválida: CEMA_API_URL ausente. Copie .env.example para .env e preencha.');
  }
  if (!/^https:\/\/[^\s/]+/i.test(url)) {
    throw new Error('Configuração inválida: CEMA_API_URL deve começar com https://.');
  }
  if (!chave) {
    throw new Error('Configuração inválida: CEMA_API_CHAVE vazia. Cole a chave do agente no arquivo .env, na linha CEMA_API_CHAVE=.');
  }
  return { baseUrl: `${url.replace(/\/+$/, '')}/api/v1`, chave };
}
