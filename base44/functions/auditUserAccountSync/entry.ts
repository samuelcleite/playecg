import { createClientFromRequest } from 'npm:@base44/sdk';

// Auditoria somente leitura: compara User x Account e devolve um relatório JSON.
// Não faz nenhum create/update/delete em nenhuma entidade, sob nenhuma condição.

const COMPARED_FIELDS = [
  'full_name',
  'subscription_type',
  'role',
  'points',
  'level',
  'specialty',
  'country',
  'state',
  'city',
  'profile_completed',
  'subscription_start_date',
  'total_attempts',
  'total_first_attempts',
  'correct_first_attempts',
  'module_first_attempts',
  'module_correct_first_attempts',
  'current_streak',
  'last_practice_date',
];

async function listAll(entities, entityName) {
  const batchSize = 500;
  let skip = 0;
  let all = [];
  while (true) {
    const batch = await entities[entityName].list(null, batchSize, skip);
    if (!batch || batch.length === 0) break;
    all = all.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// Chave "frouxa": ignora TODO espaço (não só nas pontas) além de caixa, para pegar
// grafias que a normalização principal (trim + lowercase) não colapsaria sozinha.
function looseKey(email) {
  return (email || '').replace(/\s+/g, '').toLowerCase();
}

function fieldValue(record, field) {
  const v = record[field];
  return v === undefined ? null : v;
}

export default async function auditUserAccountSync(req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const svc = base44.asServiceRole.entities;
  const users = await listAll(svc, 'User');
  const accounts = await listAll(svc, 'Account');

  const usersByEmail = new Map();
  for (const u of users) {
    const key = normalizeEmail(u.email);
    if (key && !usersByEmail.has(key)) usersByEmail.set(key, u);
  }

  const accountsByEmail = new Map();
  for (const a of accounts) {
    const key = normalizeEmail(a.email);
    if (key && !accountsByEmail.has(key)) accountsByEmail.set(key, a);
  }

  const users_sem_account = [];
  for (const u of users) {
    const key = normalizeEmail(u.email);
    if (!key || !accountsByEmail.has(key)) {
      users_sem_account.push({
        email: u.email ?? null,
        full_name: u.full_name ?? null,
        subscription_type: u.subscription_type ?? null,
        role: u.role ?? null,
        created_date: u.created_date ?? null,
      });
    }
  }

  const accounts_sem_user = [];
  for (const a of accounts) {
    const key = normalizeEmail(a.email);
    if (!key || !usersByEmail.has(key)) {
      accounts_sem_user.push({
        email: a.email ?? null,
        full_name: a.full_name ?? null,
        subscription_type: a.subscription_type ?? null,
        google_id_presente: !!a.google_id,
        apple_id_presente: !!a.apple_id,
      });
    }
  }

  const pares_casados = [];
  for (const [key, u] of usersByEmail.entries()) {
    const a = accountsByEmail.get(key);
    if (!a) continue;

    const divergencias = [];
    for (const field of COMPARED_FIELDS) {
      const valor_em_user = fieldValue(u, field);
      const valor_em_account = fieldValue(a, field);
      if (valor_em_user !== valor_em_account) {
        divergencias.push({ campo: field, valor_em_user, valor_em_account });
      }
    }

    pares_casados.push({ email: key, divergencias });
  }

  // emails_suspeitos: registros com email vazio/nulo, e pares de emails que só
  // diferem por caixa ou espaço em branco (inclusive espaço interno).
  const rawEmailEntries = [
    ...users.map((u) => ({ source: 'User', id: u.id, email: u.email ?? null })),
    ...accounts.map((a) => ({ source: 'Account', id: a.id, email: a.email ?? null })),
  ];

  const emails_suspeitos = [];

  for (const entry of rawEmailEntries) {
    if (!entry.email || normalizeEmail(entry.email) === '') {
      emails_suspeitos.push({
        tipo: 'email_vazio_ou_nulo',
        source: entry.source,
        id: entry.id,
        email: entry.email,
      });
    }
  }

  const looseGroups = new Map();
  for (const entry of rawEmailEntries) {
    const key = looseKey(entry.email);
    if (!key) continue;
    if (!looseGroups.has(key)) looseGroups.set(key, []);
    looseGroups.get(key).push(entry);
  }

  for (const group of looseGroups.values()) {
    const distinctRaw = new Map();
    for (const entry of group) {
      if (!distinctRaw.has(entry.email)) distinctRaw.set(entry.email, entry);
    }
    if (distinctRaw.size < 2) continue;

    const variants = [...distinctRaw.values()];
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        emails_suspeitos.push({
          tipo: 'diferem_por_caixa_ou_espaco',
          email_a: variants[i],
          email_b: variants[j],
        });
      }
    }
  }

  return Response.json({
    success: true,
    total_users: users.length,
    total_accounts: accounts.length,
    users_sem_account,
    accounts_sem_user,
    pares_casados,
    emails_suspeitos,
  });
}
