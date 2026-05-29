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
