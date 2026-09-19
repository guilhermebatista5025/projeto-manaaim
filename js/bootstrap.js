import mainScriptUrl from './script.js?url';
import financialReportUrl from './relatorio-financeiro.js?url';
import cashRegisterUrl from './caixa.js?url';
import mobileFixesUrl from './mobile-fixes.js?url';

const legacyKeys = [
  'pdvpro_vendedores', 'pdvpro_produtos', 'pdvpro_vendas', 'pdvpro_estoque_ini',
  'pdvpro_caixa_config', 'pdvpro_historico', 'pdvpro_last_encerramento',
];
for (const key of legacyKeys) localStorage.removeItem(key);

const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erro HTTP ${response.status}`);
  return body;
};

const showBlockingMessage = (title, message) => {
  document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;background:#f4f7fb;padding:24px;font-family:Arial,sans-serif">
    <section style="width:min(460px,100%);background:#fff;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(15,23,42,.12)">
      <h1 style="margin:0 0 10px;color:#15213b;font-size:1.35rem">${title}</h1>
      <p style="margin:0;color:#64748b;line-height:1.55">${message}</p>
    </section></main>`;
};

const waitForAuthentication = async () => {
  try {
    const session = await api('/auth/session');
    document.body.classList.remove('auth-pending');
    return session;
  } catch { /* mostra login */ }
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'auth-screen';
    overlay.innerHTML = `<div class="auth-card" role="dialog" aria-labelledby="auth-title" aria-describedby="auth-description">
      <div class="auth-brand">
        <div class="auth-logo" aria-hidden="true"><i class="fa-solid fa-cash-register"></i></div>
        <span class="auth-badge"><i class="fa-solid fa-shield-halved"></i> Acesso restrito</span>
      </div>
      <h1 id="auth-title">Bem-vindo ao PDV Manaaim</h1>
      <p id="auth-description">Entre com seu acesso master para gerenciar vendas, estoque e relatórios.</p>
      <form id="auth-form" novalidate>
        <label for="auth-email">E-mail
          <span class="auth-input"><i class="fa-regular fa-envelope" aria-hidden="true"></i><input id="auth-email" type="email" autocomplete="username" placeholder="seu@email.com" required></span>
        </label>
        <label for="auth-password">Senha
          <span class="auth-input"><i class="fa-solid fa-lock" aria-hidden="true"></i><input id="auth-password" type="password" minlength="6" autocomplete="current-password" placeholder="Digite sua senha" required><button type="button" id="auth-toggle-password" aria-label="Mostrar senha"><i class="fa-regular fa-eye"></i></button></span>
        </label>
        <div id="auth-error" role="alert" aria-live="polite"></div>
        <button type="submit" id="auth-login"><span>Entrar no sistema</span><i class="fa-solid fa-arrow-right"></i></button>
      </form>
      <div class="auth-security"><i class="fa-solid fa-lock"></i><span>Suas credenciais são validadas com segurança pelo servidor.</span></div>
    </div>`;
    document.body.appendChild(overlay);
    const errorEl = overlay.querySelector('#auth-error');
    const values = () => ({ email: overlay.querySelector('#auth-email').value.trim(), password: overlay.querySelector('#auth-password').value });
    const loginButton = overlay.querySelector('#auth-login');
    const busy = value => {
      loginButton.disabled = value;
      loginButton.querySelector('span').textContent = value ? 'Validando...' : 'Entrar no sistema';
    };

    overlay.querySelector('#auth-toggle-password').addEventListener('click', event => {
      const passwordInput = overlay.querySelector('#auth-password');
      const visible = passwordInput.type === 'text';
      passwordInput.type = visible ? 'password' : 'text';
      event.currentTarget.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
      event.currentTarget.innerHTML = `<i class="fa-regular fa-eye${visible ? '' : '-slash'}"></i>`;
      passwordInput.focus();
    });

    overlay.querySelector('#auth-form').addEventListener('submit', async event => {
      event.preventDefault(); busy(true); errorEl.textContent = '';
      if (!event.currentTarget.reportValidity()) { busy(false); return; }
      try {
        await api('/auth/login', { method: 'POST', body: JSON.stringify(values()) });
        const session = await api('/auth/session');
        document.body.classList.remove('auth-pending');
        overlay.remove(); resolve(session);
      }
      catch (error) { errorEl.textContent = error.message; } finally { busy(false); }
    });
    overlay.querySelector('#auth-email').focus();
  });
};

const installSessionControls = session => {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.querySelector('#auth-logout')) return;
  const button = document.createElement('button');
  button.id = 'auth-logout';
  button.type = 'button';
  button.title = `Sair do acesso de ${session.master.name}`;
  button.innerHTML = `<span class="auth-user-avatar">${session.master.name.charAt(0)}</span><span class="auth-user-name">${session.master.name}</span><i class="fa-solid fa-arrow-right-from-bracket"></i>`;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await api('/auth/logout', { method: 'POST' }); } finally { window.location.reload(); }
  });
  actions.appendChild(button);
};

const loadClassicScript = src => new Promise((resolve, reject) => {
  const script = document.createElement('script'); script.src = src;
  script.onload = resolve; script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
  document.body.appendChild(script);
});

try {
  const session = await waitForAuthentication();
  window.PDVRuntime = { api, user: session.user, master: session.master, organizationId: session.organization_id, role: 'master', serviceWorkerUrl: '/sw.js' };
  installSessionControls(session);
  await loadClassicScript(mainScriptUrl);
  await loadClassicScript(financialReportUrl);
  await loadClassicScript(cashRegisterUrl);
  await loadClassicScript(mobileFixesUrl);
} catch (error) {
  console.error(error);
  showBlockingMessage('Não foi possível iniciar o sistema', error.message || 'Erro ao acessar o servidor.');
}
