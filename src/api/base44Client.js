import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { comRetentativaNasLeituras } from '@/lib/retentativa';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
const cliente = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

// O cliente que o app usa repete LEITURAS em 429 (ver retentativa.js): uma
// leitura recusada pelo limite de volume do Base44 deixava de derrubar a tela
// inteira. Escritas passam direto, sem retentativa.
export const base44 = comRetentativaNasLeituras(cliente);
