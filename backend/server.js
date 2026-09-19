import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';
import {
  findMasterByCredentials,
  findMasterByEmail,
  loadMasterAccounts,
  mastersAreConfigured,
  publicMaster,
} from './master-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3001);
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const organizationName = process.env.ORGANIZATION_NAME || process.env.VITE_ORGANIZATION_NAME || 'Manaaim';
const production = process.env.NODE_ENV === 'production';
const masterAccounts = loadMasterAccounts();
const masterLoginAttempts = new Map();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;

if (!supabaseUrl || !supabaseAnonKey) throw new Error('Configure SUPABASE_URL e SUPABASE_ANON_KEY no .env.');

const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const cookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
const applySessionCookies = (res, session) => {
  const maxAge = Math.max(60, session.expires_in || 3600) * 1000;
  res.cookie('pdv_access', session.access_token, { ...cookieOptions, maxAge });
  res.cookie('pdv_refresh', session.refresh_token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
};
const clearSessionCookies = res => {
  res.clearCookie('pdv_access', cookieOptions);
  res.clearCookie('pdv_refresh', cookieOptions);
};
const userClient = accessToken => createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

const loginRateLimit = (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || 'local';
  const now = Date.now();
  const current = masterLoginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    masterLoginAttempts.set(key, { count: 0, resetAt: now + loginWindowMs });
    return next();
  }
  if (current.count >= maxLoginAttempts) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }
  next();
};

const registerFailedLogin = req => {
  const key = req.ip || req.socket.remoteAddress || 'local';
  const now = Date.now();
  const current = masterLoginAttempts.get(key);
  if (!current || current.resetAt <= now) masterLoginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
  else current.count += 1;
};

const clearLoginAttempts = req => {
  const key = req.ip || req.socket.remoteAddress || 'local';
  masterLoginAttempts.delete(key);
};

const requireAuth = async (req, res, next) => {
  let accessToken = req.cookies.pdv_access;
  let result = accessToken ? await authClient.auth.getUser(accessToken) : { data: {}, error: new Error('Sessão ausente') };
  if (result.error && req.cookies.pdv_refresh) {
    const refreshed = await authClient.auth.refreshSession({ refresh_token: req.cookies.pdv_refresh });
    if (!refreshed.error && refreshed.data.session) {
      applySessionCookies(res, refreshed.data.session);
      accessToken = refreshed.data.session.access_token;
      result = { data: { user: refreshed.data.user }, error: null };
    }
  }
  if (result.error || !result.data.user || !accessToken) {
    clearSessionCookies(res);
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
  const master = findMasterByEmail(masterAccounts, result.data.user.email);
  if (!master) {
    clearSessionCookies(res);
    return res.status(403).json({ error: 'Este usuário não possui acesso master.' });
  }
  req.user = result.data.user;
  req.master = master;
  req.db = userClient(accessToken);
  next();
};

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const assertNoError = result => { if (result.error) throw result.error; return result.data; };
const resolveOrganization = async req => {
  let memberships = assertNoError(await req.db.from('organization_members')
    .select('organization_id, role').eq('user_id', req.user.id).eq('ativo', true).limit(1));
  if (!memberships.length) {
    assertNoError(await req.db.from('organizations').insert({ nome: organizationName, created_by: req.user.id }));
    memberships = assertNoError(await req.db.from('organization_members')
      .select('organization_id, role').eq('user_id', req.user.id).eq('ativo', true).limit(1));
  }
  if (!memberships[0]) throw new Error('Usuário sem organização ativa.');
  return memberships[0];
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/auth/session', requireAuth, asyncRoute(async (req, res) => {
  const membership = await resolveOrganization(req);
  res.json({ user: { id: req.user.id, email: req.user.email }, master: publicMaster(req.master), ...membership });
}));
app.post('/api/auth/login', loginRateLimit, asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (!mastersAreConfigured(masterAccounts)) {
    return res.status(503).json({ error: 'Os dois acessos master ainda não foram configurados no servidor.' });
  }
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  const master = findMasterByCredentials(masterAccounts, email, password);
  if (!master) {
    registerFailedLogin(req);
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error) {
    registerFailedLogin(req);
    console.warn(`Falha ao autenticar o master ${master.id} no Supabase Auth: ${error.message}`);
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  clearLoginAttempts(req);
  applySessionCookies(res, data.session);
  res.json({ user: { id: data.user.id, email: data.user.email }, master: publicMaster(master) });
}));
app.post('/api/auth/signup', (_req, res) => res.status(403).json({ error: 'Cadastro público desativado.' }));
app.post('/api/auth/logout', (_req, res) => { clearSessionCookies(res); res.status(204).end(); });

app.use('/api', requireAuth);

app.get('/api/data', asyncRoute(async (req, res) => {
  const membership = await resolveOrganization(req);
  const org = membership.organization_id;
  const results = await Promise.all([
    req.db.from('vendedores').select('*').eq('organization_id', org).eq('ativo', true).order('nome'),
    req.db.from('categories').select('*').eq('organization_id', org).eq('ativo', true).order('nome'),
    req.db.from('products').select('*').eq('organization_id', org).eq('ativo', true).order('nome'),
    req.db.from('sales').select('*, sale_items(*)').eq('organization_id', org).eq('status', 'concluida').order('sold_at'),
    req.db.from('store_settings').select('*').eq('organization_id', org).single(),
    req.db.from('financial_reports').select('id, report_snapshot, created_at').eq('organization_id', org).order('created_at', { ascending: false }),
    req.db.from('cash_sessions').select('*').eq('organization_id', org).order('opened_at', { ascending: false }),
  ]);
  results.forEach(assertNoError);
  res.json({ organizationId: org, role: membership.role, vendedores: results[0].data,
    categorias: results[1].data, produtos: results[2].data, vendas: results[3].data,
    config: results[4].data, relatorios: results[5].data, caixas: results[6].data });
}));

app.post('/api/vendedores', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const data = assertNoError(await req.db.from('vendedores').insert({ organization_id: org, nome: String(req.body.nome || '').trim() }).select().single());
  res.status(201).json(data);
}));
app.patch('/api/vendedores/:id', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const data = assertNoError(await req.db.from('vendedores').update({ nome: String(req.body.nome || '').trim() }).eq('id', req.params.id).eq('organization_id', org).select().single());
  res.json(data);
}));
app.delete('/api/vendedores/:id', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  assertNoError(await req.db.from('vendedores').update({ ativo: false }).eq('id', req.params.id).eq('organization_id', org));
  res.status(204).end();
}));

app.post('/api/produtos', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const category = assertNoError(await req.db.from('categories').select('id').eq('organization_id', org).eq('nome', req.body.categoria).single());
  const data = assertNoError(await req.db.from('products').insert({ organization_id: org, vendedor_id: req.body.vendedorId,
    category_id: category.id, nome: String(req.body.nome || '').trim(), preco: Number(req.body.preco),
    estoque_atual: Number(req.body.qtd), estoque_inicial: Number(req.body.qtd) }).select().single());
  res.status(201).json(data);
}));
app.patch('/api/produtos/:id', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const current = assertNoError(await req.db.from('products').select('estoque_atual').eq('id', req.params.id).eq('organization_id', org).single());
  const category = assertNoError(await req.db.from('categories').select('id').eq('organization_id', org).eq('nome', req.body.categoria).single());
  assertNoError(await req.db.from('products').update({ nome: String(req.body.nome || '').trim(), preco: Number(req.body.preco), category_id: category.id }).eq('id', req.params.id).eq('organization_id', org));
  const delta = Number(req.body.qtd) - current.estoque_atual;
  if (delta) assertNoError(await req.db.rpc('adjust_stock', { p_organization_id: org, p_product_id: req.params.id, p_quantity_delta: delta, p_reason: 'Alteração pelo cadastro do produto' }));
  res.status(204).end();
}));
app.delete('/api/produtos/:id', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  assertNoError(await req.db.from('products').update({ ativo: false }).eq('id', req.params.id).eq('organization_id', org));
  res.status(204).end();
}));

app.post('/api/vendas', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  let sessions = assertNoError(await req.db.from('cash_sessions').select('*').eq('organization_id', org).eq('status', 'aberto').limit(1));
  if (!sessions.length) sessions = [assertNoError(await req.db.from('cash_sessions').insert({ organization_id: org, opened_by: req.user.id, opening_amount: 0 }).select().single())];
  const saleId = assertNoError(await req.db.rpc('finalize_sale', { p_organization_id: org,
    p_cash_session_id: sessions[0].id, p_vendedor_id: req.body.vendedorId,
    p_payment_method: 'dinheiro', p_received_amount: Number(req.body.recebido),
    p_items: req.body.itens.map(item => ({ product_id: item.produtoId, quantity: item.qtd })) }));
  res.status(201).json({ id: saleId });
}));

app.patch('/api/config', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  assertNoError(await req.db.from('store_settings').update({ usar_horario_padrao: req.body.usarPadrao,
    abertura: req.body.abertura, fechamento: req.body.fechamento }).eq('organization_id', org));
  res.status(204).end();
}));
app.post('/api/relatorios', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const end = new Date(req.body.dataCriacao || Date.now()); const start = new Date(end); start.setHours(0, 0, 0, 0);
  const data = assertNoError(await req.db.from('financial_reports').insert({ organization_id: org,
    period_start: start.toISOString(), period_end: end.toISOString(),
    taxa_aplicada: req.body.totalBruto ? Number(req.body.valorTaxa || 0) / Number(req.body.totalBruto) : 0.1,
    report_snapshot: req.body, created_by: req.user.id }).select('id').single());
  res.status(201).json(data);
}));
app.post('/api/relatorios-financeiros', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const end = new Date(); const start = new Date(end); start.setHours(0, 0, 0, 0);
  const data = assertNoError(await req.db.from('financial_reports').insert({
    organization_id: org, period_start: start.toISOString(), period_end: end.toISOString(),
    fichas_cantina: Number(req.body.fichasCantina), fichas_fornecedores: Number(req.body.fichasFornecedores),
    bruto_cantina: Number(req.body.brutoCantina), caixa_inicial: Number(req.body.caixaInicial),
    valor_pix: Number(req.body.valorPix), caixa_final: Number(req.body.caixaFinal),
    report_snapshot: { tipo: 'financeiro', ...req.body }, created_by: req.user.id,
  }).select('id').single());
  res.status(201).json(data);
}));
app.delete('/api/relatorios/:id', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  assertNoError(await req.db.from('financial_reports').delete().eq('id', req.params.id).eq('organization_id', org));
  res.status(204).end();
}));
app.post('/api/caixa/fechar', asyncRoute(async (req, res) => {
  const { organization_id: org } = await resolveOrganization(req);
  const sessions = assertNoError(await req.db.from('cash_sessions').select('*').eq('organization_id', org).eq('status', 'aberto').limit(1));
  if (!sessions.length) return res.status(409).json({ error: 'Não há caixa aberto.' });
  const data = assertNoError(await req.db.rpc('close_cash_session', { p_organization_id: org,
    p_cash_session_id: sessions[0].id, p_closing_amount: Number(req.body.closingAmount || 0), p_notes: 'Fechamento pelo PDV' }));
  res.json(data);
}));

if (production) {
  app.get('/sw.js', (_req, res) => res.sendFile(path.join(rootDir, 'sw.js')));
  app.use(express.static(path.join(rootDir, 'dist')));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')));
}
app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error.status || error.statusCode) || 500;
  res.status(status).json({ error: status >= 500 ? 'Erro interno no servidor.' : error.message });
});
app.listen(port, '127.0.0.1', () => console.log(`Backend PDV disponível em http://127.0.0.1:${port}`));
