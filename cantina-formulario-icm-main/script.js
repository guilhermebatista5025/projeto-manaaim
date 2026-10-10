const form = document.querySelector('#productForm');
const list = document.querySelector('#productList');
const template = document.querySelector('#productTemplate');
const message = document.querySelector('#formMessage');
const submitButton = document.querySelector('#submitButton');
const addButton = document.querySelector('#addProduct');

const api = async (path, options = {}) => {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || 'Não foi possível concluir a operação.'); error.status = response.status; throw error; }
  return body;
};

const setMessage = (text = '', type = '') => { message.textContent = text; message.className = `form-message${type ? ` is-${type}` : ''}`; };
const formatPrice = input => {
  const digits = input.value.replace(/\D/g, '').slice(0, 10);
  input.dataset.cents = digits || '0';
  input.value = digits ? (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
};
const updateCards = () => {
  const cards = [...list.querySelectorAll('.product-card')];
  cards.forEach((card, index) => { card.querySelector('.product-number').textContent = String(index + 1).padStart(2, '0'); card.querySelector('.remove-product').hidden = cards.length === 1; });
  document.querySelector('#itemCount').textContent = cards.length;
  document.querySelector('.item-count span').textContent = cards.length === 1 ? 'item' : 'itens';
  addButton.disabled = cards.length >= 50;
};
const addProduct = (focus = false) => {
  if (list.children.length >= 50) return;
  const card = template.content.firstElementChild.cloneNode(true);
  card.querySelector('.remove-product').addEventListener('click', () => { card.remove(); updateCards(); });
  card.querySelector('.qty-minus').addEventListener('click', () => { const input = card.querySelector('.product-quantity'); input.value = Math.max(1, Number(input.value || 1) - 1); });
  card.querySelector('.qty-plus').addEventListener('click', () => { const input = card.querySelector('.product-quantity'); input.value = Math.min(100000, Number(input.value || 0) + 1); });
  card.querySelector('.product-price').addEventListener('input', event => formatPrice(event.currentTarget));
  list.appendChild(card); updateCards();
  if (focus) card.querySelector('.product-name').focus();
};
const collectItems = () => [...list.querySelectorAll('.product-card')].map(card => ({
  nome: card.querySelector('.product-name').value.trim(), qtd: Number(card.querySelector('.product-quantity').value), preco: Number(card.querySelector('.product-price').dataset.cents || 0) / 100,
}));
const validateItems = items => {
  const cards = [...list.querySelectorAll('.product-card')]; let firstInvalid = null;
  items.forEach((item, index) => { const invalid = !item.nome || !Number.isInteger(item.qtd) || item.qtd < 1 || item.preco <= 0; cards[index].classList.toggle('has-error', invalid); if (invalid && !firstInvalid) firstInvalid = cards[index]; });
  firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return !firstInvalid;
};

addButton.addEventListener('click', () => addProduct(true));
form.addEventListener('input', event => { event.target.closest('.product-card')?.classList.remove('has-error'); setMessage(); });
form.addEventListener('submit', async event => {
  event.preventDefault(); const items = collectItems();
  if (!validateItems(items)) { setMessage('Confira os campos destacados antes de enviar.', 'error'); return; }
  submitButton.disabled = true; submitButton.querySelector('span').textContent = 'Enviando...'; setMessage('Salvando os produtos no PDV...', 'progress');
  try {
    const result = await api('/formulario/produtos', { method: 'POST', body: JSON.stringify({ itens: items }) });
    setMessage(`${result.totalProdutos} ${result.totalProdutos === 1 ? 'produto cadastrado' : 'produtos cadastrados'} no estoque de ${result.vendedorNome}.`, 'success');
    list.innerHTML = ''; addProduct(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    if (error.status === 401 || error.status === 403) setTimeout(() => window.location.replace('/'), 1800);
    setMessage(error.message, 'error');
  } finally { submitButton.disabled = false; submitButton.querySelector('span').textContent = 'Enviar ao estoque'; }
});
document.querySelector('#logoutButton').addEventListener('click', async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { window.location.replace('/'); } });

const start = async () => {
  try {
    const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');
    const session = previewMode
      ? { access: { type: 'form', name: 'Guilherme' } }
      : await api('/auth/session');
    if (session.access?.type !== 'form') return window.location.replace('/');
    document.querySelector('#accountName').textContent = session.access.name;
    document.querySelector('#sellerName').textContent = session.access.name;
    document.querySelector('#accountAvatar').textContent = session.access.name.charAt(0).toUpperCase();
    addProduct(); document.body.classList.remove('is-loading'); document.querySelector('#loadingScreen').remove();
  } catch { window.location.replace('/'); }
};
start();
