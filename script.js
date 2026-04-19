/**
 * PDV Pro — script.js v2.1
 * Melhorias: Categorias, Filtro PDV, Controle Estoque Zerado
 */

'use strict';

/* =====================================================
  CONSTANTES GLOBAIS
  ===================================================== */
const CATEGORIAS = ['Bebidas', 'Bolos', 'Doces', 'Gelados', 'Salgados', 'Outros'];

const CATEGORIA_CONFIG = {
  Bebidas:  { icon: 'fa-wine-bottle',      cor: '#1a56db' },
  Bolos:    { icon: 'fa-cake-candles',     cor: '#d97706' },
  Doces:    { icon: 'fa-candy-cane',       cor: '#e74694' },
  Gelados:  { icon: 'fa-ice-cream',        cor: '#0ea5e9' },
  Salgados: { icon: 'fa-burger',           cor: '#f97316' },
  Outros:   { icon: 'fa-box',             cor: '#6b7494' },
};


/* =====================================================
  MÓDULO: DB — Camada de persistência (localStorage)
  ===================================================== */
const DB = (() => {
  const KEYS = {
    vendedores:  'pdvpro_vendedores',
    produtos:    'pdvpro_produtos',
    vendas:      'pdvpro_vendas',
    estoque_ini: 'pdvpro_estoque_ini',
  };

  const get  = key => JSON.parse(localStorage.getItem(key) || '[]');
  const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
  const genId = () => '_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

  // --- Vendedores ---
  const getVendedores    = ()      => get(KEYS.vendedores);
  const saveVendedores   = list   => save(KEYS.vendedores, list);
  const getVendedorById  = id     => getVendedores().find(v => v.id === id);

  const addVendedor = nome => {
    const list = getVendedores();
    const v = { id: genId(), nome: nome.trim() };
    list.push(v);
    saveVendedores(list);
    return v;
  };
  const updateVendedor = (id, nome) => {
    saveVendedores(getVendedores().map(v => v.id === id ? { ...v, nome: nome.trim() } : v));
  };
  const deleteVendedor = id => {
    saveVendedores(getVendedores().filter(v => v.id !== id));
    saveProdutos(getProdutos().filter(p => p.vendedorId !== id));
  };

  // --- Produtos ---
  const getProdutos              = ()    => get(KEYS.produtos);
  const saveProdutos             = list => save(KEYS.produtos, list);
  const getProdutosByVendedor    = vid  => getProdutos().filter(p => p.vendedorId === vid);
  const getProdutoById           = id   => getProdutos().find(p => p.id === id);

  // Produtos com estoque > 0
  const getProdutosDisponiveisByVendedor = vid =>
    getProdutosByVendedor(vid).filter(p => p.qtd > 0);

  // Produtos com estoque = 0
  const getProdutosEsgotados             = ()    => getProdutos().filter(p => p.qtd === 0);
  const getProdutosEsgotadosByVendedor   = vid  => getProdutosByVendedor(vid).filter(p => p.qtd === 0);

  // Categorias em uso por vendedor
  const getCategoriasByVendedor = vid => {
    const prods = getProdutosDisponiveisByVendedor(vid);
    return [...new Set(prods.map(p => p.categoria || 'Outros'))].sort();
  };

  const addProduto = (vendedorId, nome, preco, qtd, categoria) => {
    const list = getProdutos();
    const p = {
      id: genId(),
      vendedorId,
      nome: nome.trim(),
      preco: +preco,
      qtd: +qtd,
      qtdInicial: +qtd,
      categoria: categoria || 'Outros',
    };
    list.push(p);
    saveProdutos(list);
    _snapshotEstoque(p.id, +qtd);
    return p;
  };

  const updateProduto = (id, nome, preco, qtd, categoria) => {
    const list = getProdutos().map(p => {
      if (p.id !== id) return p;
      const novaQtd = +qtd;
      if (novaQtd > p.qtd) _snapshotEstoque(id, novaQtd);
      return { ...p, nome: nome.trim(), preco: +preco, qtd: novaQtd, categoria: categoria || p.categoria || 'Outros' };
    });
    saveProdutos(list);
  };

  const deleteProduto = id => saveProdutos(getProdutos().filter(p => p.id !== id));

  const decrementarEstoque = (id, qtdVendida) => {
    const list = getProdutos().map(p =>
      p.id === id ? { ...p, qtd: Math.max(0, p.qtd - qtdVendida) } : p
    );
    saveProdutos(list);
  };

  // --- Estoque Inicial ---
  const _snapshotEstoque = (produtoId, qtd) => {
    const map = JSON.parse(localStorage.getItem(KEYS.estoque_ini) || '{}');
    map[produtoId] = qtd;
    localStorage.setItem(KEYS.estoque_ini, JSON.stringify(map));
  };
  const getEstoqueInicial = () => JSON.parse(localStorage.getItem(KEYS.estoque_ini) || '{}');

  // --- Vendas ---
  const getVendas           = ()    => get(KEYS.vendas);
  const getVendasByVendedor = vid  => getVendas().filter(v => v.vendedorId === vid);

  const addVenda = (vendedorId, itens, total, recebido, troco) => {
    const list = getVendas();
    const v = { id: genId(), vendedorId, itens, total, recebido, troco, data: new Date().toISOString() };
    list.push(v);
    save(KEYS.vendas, list);
    return v;
  };

  return {
    getVendedores, addVendedor, updateVendedor, deleteVendedor, getVendedorById,
    getProdutos, getProdutosByVendedor, getProdutoById,
    getProdutosDisponiveisByVendedor,
    getProdutosEsgotados, getProdutosEsgotadosByVendedor,
    getCategoriasByVendedor,
    addProduto, updateProduto, deleteProduto, decrementarEstoque,
    getEstoqueInicial,
    getVendas, addVenda, getVendasByVendedor,
  };
})();


/* =====================================================
  MÓDULO: Utils
  ===================================================== */
const Utils = (() => {
  const fmtMoeda = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  const fmtData  = iso => new Date(iso).toLocaleString('pt-BR');
  const sanitize = str => String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const initials = nome => nome.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  return { fmtMoeda, fmtData, sanitize, initials, $, $$ };
})();


/* =====================================================
  MÓDULO: UI — Toast, Modal, Clock
  ===================================================== */
const UI = (() => {
  const { $ } = Utils;

  const toast = (msg, type = 'info') => {
    const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${Utils.sanitize(msg)}</span>`;
    $('#toast-container').prepend(el);
    setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 350); }, 3000);
  };

  const openModal = id => {
    const el = $('#' + id);
    if (el) { el.classList.add('open'); el.querySelector('input, select')?.focus(); }
  };
  const closeModal = id => {
    const el = $('#' + id);
    if (el) el.classList.remove('open');
  };
  const closeAllModals = () =>
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));

  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeAllModals();
    if (e.target.closest('.modal-close')) {
      const attr = e.target.closest('.modal-close').dataset.modal;
      if (attr) closeModal(attr);
    }
  });

  let _confirmCb = null;
  const confirm = (msg, titulo = 'Confirmar ação', cb) => {
    $('#modal-confirm-msg').textContent = msg;
    $('#modal-confirm-titulo').textContent = titulo;
    _confirmCb = cb;
    openModal('modal-confirm');
  };
  $('#btn-confirm-ok')?.addEventListener('click', () => {
    closeModal('modal-confirm');
    if (_confirmCb) { _confirmCb(); _confirmCb = null; }
  });

  const startClock = () => {
    const el = $('#clock');
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);
  };

  const populateVendedorSelect = (selId, selectedId = '', emptyLabel = '— Selecione um vendedor —') => {
    const sel = $('#' + selId);
    if (!sel) return;
    const vendedores = DB.getVendedores();
    sel.innerHTML = `<option value="">${emptyLabel}</option>` +
      vendedores.map(v =>
        `<option value="${v.id}" ${v.id === selectedId ? 'selected' : ''}>${Utils.sanitize(v.nome)}</option>`
      ).join('');
  };

  return { toast, openModal, closeModal, closeAllModals, confirm, startClock, populateVendedorSelect };
})();


/* =====================================================
  MÓDULO: Vendedores
  ===================================================== */
const ModVendedores = (() => {
  const { $, sanitize, initials, fmtMoeda } = Utils;

  const render = () => {
    const container = $('#vendedores-lista');
    const vendedores = DB.getVendedores();
    if (!vendedores.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <i class="fa-solid fa-users-slash"></i>
        <p>Nenhum vendedor cadastrado ainda</p>
      </div>`;
      return;
    }
    container.innerHTML = vendedores.map(v => {
      const produtos     = DB.getProdutosByVendedor(v.id);
      const vendas       = DB.getVendasByVendedor(v.id);
      const totalVendido = vendas.reduce((acc, venda) => acc + venda.total, 0);
      const esgotados    = DB.getProdutosEsgotadosByVendedor(v.id).length;
      return `
        <div class="vendedor-card" data-id="${v.id}">
          <div class="vendedor-avatar">${sanitize(initials(v.nome))}</div>
          <div class="vendedor-nome">${sanitize(v.nome)}</div>
          <div class="vendedor-stats">
            <span><i class="fa-solid fa-box" style="width:14px"></i> ${produtos.length} produto(s)</span>
            <span><i class="fa-solid fa-receipt" style="width:14px"></i> ${vendas.length} venda(s)</span>
            <span style="color:var(--green)"><i class="fa-solid fa-dollar-sign" style="width:14px"></i> ${fmtMoeda(totalVendido)}</span>
            ${esgotados > 0 ? `<span style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation" style="width:14px"></i> ${esgotados} esgotado(s)</span>` : ''}
          </div>
          <div class="vendedor-actions">
            <button class="btn-icon btn-edit btn-edit-vendedor" title="Editar" data-id="${v.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon btn-del btn-del-vendedor" title="Excluir" data-id="${v.id}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`;
    }).join('');
  };

  const openNew = () => {
    $('#modal-vendedor-titulo').textContent = 'Novo Vendedor';
    $('#vendedor-id-edit').value = '';
    $('#vendedor-nome-input').value = '';
    UI.openModal('modal-vendedor');
  };

  const openEdit = id => {
    const v = DB.getVendedorById(id);
    if (!v) return;
    $('#modal-vendedor-titulo').textContent = 'Editar Vendedor';
    $('#vendedor-id-edit').value = v.id;
    $('#vendedor-nome-input').value = v.nome;
    UI.openModal('modal-vendedor');
  };

  const save = () => {
    const nome = $('#vendedor-nome-input').value.trim();
    if (!nome) { UI.toast('Informe o nome do vendedor.', 'error'); return; }
    const id = $('#vendedor-id-edit').value;
    if (id) {
      DB.updateVendedor(id, nome);
      UI.toast('Vendedor atualizado!', 'success');
    } else {
      DB.addVendedor(nome);
      UI.toast('Vendedor cadastrado!', 'success');
    }
    UI.closeModal('modal-vendedor');
    render();
    _refreshSelects();
  };

  const del = id => {
    const v = DB.getVendedorById(id);
    if (!v) return;
    UI.confirm(`Excluir "${v.nome}"? Todos os produtos vinculados também serão removidos.`, 'Excluir Vendedor', () => {
      DB.deleteVendedor(id);
      UI.toast('Vendedor excluído.', 'info');
      render();
      _refreshSelects();
    });
  };

  const _refreshSelects = () => {
    UI.populateVendedorSelect('pdv-vendedor-select');
    UI.populateVendedorSelect('estoque-vendedor-select');
    UI.populateVendedorSelect('relatorio-vendedor-select', '', 'Todos os vendedores');
  };

  document.addEventListener('click', e => {
    if (e.target.closest('.btn-edit-vendedor')) openEdit(e.target.closest('.btn-edit-vendedor').dataset.id);
    if (e.target.closest('.btn-del-vendedor'))  del(e.target.closest('.btn-del-vendedor').dataset.id);
  });

  $('#btn-novo-vendedor')?.addEventListener('click', openNew);
  $('#btn-salvar-vendedor')?.addEventListener('click', save);

  return { render, _refreshSelects };
})();


/* =====================================================
  MÓDULO: Estoque
  ===================================================== */
const ModEstoque = (() => {
  const { $, sanitize, fmtMoeda } = Utils;
  let _vendedorAtivo = '';

  /* ── Helpers de categoria ── */
  const _categoriaBadge = cat => {
    const cfg = CATEGORIA_CONFIG[cat] || CATEGORIA_CONFIG['Outros'];
    return `<span class="cat-badge" style="--cat-cor:${cfg.cor}">
      <i class="fa-solid ${cfg.icon}"></i> ${sanitize(cat)}
    </span>`;
  };

  /* ── Render tabela principal ── */
  const renderTabela = () => {
    const tbody = $('#estoque-tbody');
    const produtos = DB.getProdutosByVendedor(_vendedorAtivo);

    if (!produtos.length) {
      tbody.innerHTML = `<tr><td colspan="5">
        <div class="empty-state"><i class="fa-solid fa-box-open"></i><p>Nenhum produto cadastrado</p></div>
      </td></tr>`;
      _renderEsgotados();
      return;
    }

    // Ordenar: disponíveis primeiro (A→Z), depois esgotados
    const disponíveis = produtos.filter(p => p.qtd > 0).sort((a, b) => a.nome.localeCompare(b.nome));
    const esgotados   = produtos.filter(p => p.qtd === 0).sort((a, b) => a.nome.localeCompare(b.nome));
    const ordenados   = [...disponíveis, ...esgotados];

    tbody.innerHTML = ordenados.map(p => `
      <tr class="${p.qtd === 0 ? 'row-esgotado' : ''}">
        <td>${sanitize(p.nome)}</td>
        <td>${_categoriaBadge(p.categoria || 'Outros')}</td>
        <td>${fmtMoeda(p.preco)}</td>
        <td>
          <span class="badge ${p.qtd > 5 ? 'badge-green' : p.qtd > 0 ? 'badge-yellow' : 'badge-red'}">
            ${p.qtd === 0 ? '<i class="fa-solid fa-ban" style="font-size:.65rem"></i> ' : ''}${p.qtd}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-icon btn-edit btn-edit-produto" title="Editar" data-id="${p.id}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon btn-del btn-del-produto" title="Excluir" data-id="${p.id}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`).join('');

    _renderEsgotados();
  };

  /* ── Card de Esgotados ── */
  const _renderEsgotados = () => {
    let card = document.getElementById('estoque-esgotados-card');
    if (!card) {
      // Criar card e inserir após a tabela principal
      card = document.createElement('div');
      card.id = 'estoque-esgotados-card';
      card.className = 'card mt-16 esgotados-card';
      const estoquePainel = document.getElementById('estoque-painel');
      if (estoquePainel) estoquePainel.appendChild(card);
    }

    const esgotados = _vendedorAtivo
      ? DB.getProdutosEsgotadosByVendedor(_vendedorAtivo)
      : DB.getProdutosEsgotados();

    if (!esgotados.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    card.innerHTML = `
      <div class="card-header esgotados-header">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Produtos Esgotados
        <span class="esgotados-count">${esgotados.length}</span>
      </div>
      <div class="card-body">
        <div class="esgotados-grid">
          ${esgotados.sort((a, b) => a.nome.localeCompare(b.nome)).map(p => `
            <div class="esgotado-item">
              <div class="esgotado-icon">
                <i class="fa-solid ${(CATEGORIA_CONFIG[p.categoria] || CATEGORIA_CONFIG['Outros']).icon}"></i>
              </div>
              <div class="esgotado-info">
                <span class="esgotado-nome">${sanitize(p.nome)}</span>
                <span class="esgotado-cat">${sanitize(p.categoria || 'Outros')}</span>
              </div>
              <span class="badge badge-red">
                <i class="fa-solid fa-ban" style="font-size:.6rem"></i> 0
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  /* ── Modal Novo ── */
  const openNew = () => {
    $('#modal-produto-titulo').textContent = 'Novo Produto';
    $('#produto-id-edit').value   = '';
    $('#produto-nome-input').value = '';
    $('#produto-preco-input').value = '';
    $('#produto-qtd-input').value  = '';
    const catSel = $('#produto-categoria-input');
    if (catSel) catSel.value = '';
    UI.openModal('modal-produto');
  };

  /* ── Modal Editar ── */
  const openEdit = id => {
    const p = DB.getProdutoById(id);
    if (!p) return;
    $('#modal-produto-titulo').textContent = 'Editar Produto';
    $('#produto-id-edit').value    = p.id;
    $('#produto-nome-input').value  = p.nome;
    $('#produto-preco-input').value = p.preco;
    $('#produto-qtd-input').value   = p.qtd;
    const catSel = $('#produto-categoria-input');
    if (catSel) catSel.value = p.categoria || 'Outros';
    UI.openModal('modal-produto');
  };

  /* ── Salvar ── */
  const save = () => {
    const nome      = $('#produto-nome-input').value.trim();
    const preco     = parseFloat($('#produto-preco-input').value);
    const qtd       = parseInt($('#produto-qtd-input').value);
    const categoria = $('#produto-categoria-input')?.value || '';

    if (!nome)                     { UI.toast('Informe o nome do produto.', 'error'); return; }
    if (!categoria)                { UI.toast('Selecione uma categoria.', 'error'); return; }
    if (isNaN(preco) || preco < 0) { UI.toast('Preço inválido.', 'error'); return; }
    if (isNaN(qtd)   || qtd < 0)  { UI.toast('Quantidade inválida.', 'error'); return; }

    const id = $('#produto-id-edit').value;
    if (id) {
      DB.updateProduto(id, nome, preco, qtd, categoria);
      UI.toast('Produto atualizado!', 'success');
    } else {
      DB.addProduto(_vendedorAtivo, nome, preco, qtd, categoria);
      UI.toast('Produto adicionado!', 'success');
    }
    UI.closeModal('modal-produto');
    renderTabela();
    ModPDV.renderProdutos();
    ModVendedores.render();
  };

  /* ── Excluir ── */
  const del = id => {
    const p = DB.getProdutoById(id);
    if (!p) return;
    UI.confirm(`Excluir o produto "${p.nome}"?`, 'Excluir Produto', () => {
      DB.deleteProduto(id);
      UI.toast('Produto removido.', 'info');
      renderTabela();
      ModPDV.renderProdutos();
      ModVendedores.render();
    });
  };

  /* ── Injetar select de categoria no modal ── */
  const _injectCategoriaField = () => {
    const nomeGroup = $('#produto-nome-input')?.closest('.form-group');
    if (!nomeGroup || document.getElementById('produto-categoria-input')) return;

    const catGroup = document.createElement('div');
    catGroup.className = 'form-group';
    catGroup.innerHTML = `
      <label class="label-styled">
        <i class="fa-solid fa-tag" style="color:var(--accent);margin-right:4px"></i>
        Categoria *
      </label>
      <select id="produto-categoria-input" class="input-styled">
        <option value="">— Selecione uma categoria —</option>
        ${CATEGORIAS.map(c => {
          const cfg = CATEGORIA_CONFIG[c];
          return `<option value="${c}">${c}</option>`;
        }).join('')}
      </select>
    `;
    nomeGroup.insertAdjacentElement('afterend', catGroup);
  };

  /* ── Atualizar coluna Categoria na tabela de estoque ── */
  const _updateTableHeader = () => {
    const thead = document.querySelector('#estoque-tabela thead tr');
    if (!thead || thead.children.length >= 5) return;
    // Inserir "Categoria" como segunda coluna
    const thCat = document.createElement('th');
    thCat.textContent = 'Categoria';
    thead.insertBefore(thCat, thead.children[1]);
  };

  /* ── Eventos ── */
  $('#estoque-vendedor-select')?.addEventListener('change', e => {
    _vendedorAtivo = e.target.value;
    const painel = $('#estoque-painel');
    if (_vendedorAtivo) {
      const v = DB.getVendedorById(_vendedorAtivo);
      $('#estoque-vendedor-nome').textContent = `📦 Produtos de ${v?.nome || ''}`;
      painel.style.display = 'block';
      renderTabela();
    } else {
      painel.style.display = 'none';
      const card = document.getElementById('estoque-esgotados-card');
      if (card) card.style.display = 'none';
    }
  });

  $('#btn-novo-produto')?.addEventListener('click', openNew);
  $('#btn-salvar-produto')?.addEventListener('click', save);

  document.addEventListener('click', e => {
    if (e.target.closest('.btn-edit-produto')) openEdit(e.target.closest('.btn-edit-produto').dataset.id);
    if (e.target.closest('.btn-del-produto'))  del(e.target.closest('.btn-del-produto').dataset.id);
  });

  const init = () => {
    _injectCategoriaField();
    _updateTableHeader();
  };

  return { renderTabela, init };
})();


/* =====================================================
  MÓDULO: PDV
  ===================================================== */
const ModPDV = (() => {
  const { $, sanitize, fmtMoeda } = Utils;
  let _carrinho       = [];
  let _vendedorId     = '';
  let _categoriaAtiva = ''; // '' = todas

  /* ── Render filter bar ── */
  const _renderFiltros = (categorias) => {
    let bar = document.getElementById('pdv-categoria-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pdv-categoria-bar';
      bar.className = 'categoria-filter-bar';
      const lista = document.getElementById('pdv-produto-lista');
      lista.parentNode.insertBefore(bar, lista);
    }

    if (!categorias.length) {
      bar.innerHTML = '';
      return;
    }

    bar.innerHTML = `
      <button class="cat-filter-btn ${_categoriaAtiva === '' ? 'active' : ''}" data-cat="">
        <i class="fa-solid fa-border-all"></i> Todos
      </button>
      ${categorias.map(cat => {
        const cfg = CATEGORIA_CONFIG[cat] || CATEGORIA_CONFIG['Outros'];
        return `
          <button class="cat-filter-btn ${_categoriaAtiva === cat ? 'active' : ''}"
            data-cat="${cat}"
            style="--cat-cor:${cfg.cor}">
            <i class="fa-solid ${cfg.icon}"></i> ${sanitize(cat)}
          </button>
        `;
      }).join('')}
    `;

    // Bind clicks
    bar.querySelectorAll('.cat-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _categoriaAtiva = btn.dataset.cat;
        renderProdutos();
      });
    });
  };

  /* ── Render produtos ── */
  const renderProdutos = () => {
    const container = document.getElementById('pdv-produto-lista');
    if (!container) return;

    if (!_vendedorId) {
      _renderFiltros([]);
      container.innerHTML = `<div class="empty-state">
        <i class="fa-solid fa-store-slash"></i><p>Selecione um vendedor para ver os produtos</p>
      </div>`;
      _renderEsgotadosPDV();
      return;
    }

    // Só produtos com estoque > 0
    let produtos = DB.getProdutosDisponiveisByVendedor(_vendedorId);

    // Categorias disponíveis (para filtro)
    const categorias = DB.getCategoriasByVendedor(_vendedorId);
    _renderFiltros(categorias);

    // Filtrar por categoria ativa
    if (_categoriaAtiva) {
      produtos = produtos.filter(p => (p.categoria || 'Outros') === _categoriaAtiva);
    }

    // Ordenar A→Z
    produtos.sort((a, b) => a.nome.localeCompare(b.nome));

    if (!produtos.length) {
      const msg = _categoriaAtiva
        ? `Nenhum produto disponível em "${_categoriaAtiva}"`
        : 'Nenhum produto disponível em estoque';
      container.innerHTML = `<div class="empty-state">
        <i class="fa-solid fa-box-open"></i><p>${msg}</p>
      </div>`;
      _renderEsgotadosPDV();
      return;
    }

    container.innerHTML = produtos.map(p => {
      const cfg = CATEGORIA_CONFIG[p.categoria || 'Outros'] || CATEGORIA_CONFIG['Outros'];
      const estoqueClass = p.qtd <= 3 ? 'estoque-critico' : p.qtd <= 7 ? 'estoque-baixo' : '';
      return `
        <div class="produto-item ${estoqueClass}" data-id="${p.id}">
          <div class="produto-cat-strip" style="background:${cfg.cor}"></div>
          <div class="produto-info">
            <span class="produto-nome">${sanitize(p.nome)}</span>
            <div class="produto-meta">
              <span class="produto-preco">${fmtMoeda(p.preco)}</span>
              <span class="produto-estoque-badge ${p.qtd <= 3 ? 'critico' : p.qtd <= 7 ? 'baixo' : 'ok'}">
                <i class="fa-solid fa-cubes-stacked"></i> ${p.qtd}
              </span>
            </div>
          </div>
          <input type="number" class="input-styled produto-qtd-input" value="1" min="1" max="${p.qtd}" step="1"
            data-id="${p.id}" data-preco="${p.preco}" data-nome="${sanitize(p.nome)}" data-estoque="${p.qtd}" />
          <button class="btn-add-cart" data-id="${p.id}" title="Adicionar ao carrinho">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>`;
    }).join('');

    _renderEsgotadosPDV();
  };

  /* ── Mini card esgotados no PDV ── */
  const _renderEsgotadosPDV = () => {
    let card = document.getElementById('pdv-esgotados-mini');
    if (!card) {
      card = document.createElement('div');
      card.id = 'pdv-esgotados-mini';
      card.className = 'card mt-16 esgotados-mini-card';
      const productsPanel = document.getElementById('pdv-produtos-card');
      if (productsPanel) productsPanel.insertAdjacentElement('afterend', card);
    }

    if (!_vendedorId) { card.style.display = 'none'; return; }

    const esgotados = DB.getProdutosEsgotadosByVendedor(_vendedorId);
    if (!esgotados.length) { card.style.display = 'none'; return; }

    card.style.display = 'block';
    card.innerHTML = `
      <div class="card-header esgotados-header">
        <i class="fa-solid fa-ban"></i>
        Produtos Esgotados
        <span class="esgotados-count">${esgotados.length}</span>
        <button class="btn-icon btn-ver-esgotados" id="btn-ver-esgotados-pdv" title="Expandir" style="margin-left:auto">
          <i class="fa-solid fa-chevron-down" id="esgotados-chevron"></i>
        </button>
      </div>
      <div id="pdv-esgotados-body" class="card-body" style="display:none;padding:12px">
        <div class="esgotados-grid">
          ${esgotados.sort((a, b) => a.nome.localeCompare(b.nome)).map(p => {
            const cfg = CATEGORIA_CONFIG[p.categoria || 'Outros'] || CATEGORIA_CONFIG['Outros'];
            return `
              <div class="esgotado-item">
                <div class="esgotado-icon" style="background:rgba(224,36,36,.08);color:var(--red)">
                  <i class="fa-solid ${cfg.icon}"></i>
                </div>
                <div class="esgotado-info">
                  <span class="esgotado-nome">${sanitize(p.nome)}</span>
                  <span class="esgotado-cat">${sanitize(p.categoria || 'Outros')}</span>
                </div>
                <span class="badge badge-red" style="font-size:.68rem">Esgotado</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-ver-esgotados-pdv')?.addEventListener('click', () => {
      const body    = document.getElementById('pdv-esgotados-body');
      const chevron = document.getElementById('esgotados-chevron');
      const open    = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      chevron.style.transform = open ? '' : 'rotate(180deg)';
    });
  };

  /* ── Carrinho ── */
  const adicionarAoCarrinho = produtoId => {
    const input = $(`.produto-qtd-input[data-id="${produtoId}"]`);
    if (!input) return;
    const qtd     = parseInt(input.value);
    const preco   = parseFloat(input.dataset.preco);
    const nome    = input.dataset.nome;
    const estoque = parseInt(input.dataset.estoque);

    if (isNaN(qtd) || qtd <= 0) { UI.toast('Quantidade inválida.', 'error'); return; }
    if (qtd > estoque)           { UI.toast(`Estoque insuficiente (máx. ${estoque}).`, 'error'); return; }

    const idx    = _carrinho.findIndex(i => i.produtoId === produtoId);
    const novaQtd = idx >= 0 ? _carrinho[idx].qtd + qtd : qtd;
    if (novaQtd > estoque) {
      UI.toast(`Estoque insuficiente. Já tem ${_carrinho[idx]?.qtd || 0} no carrinho.`, 'error');
      return;
    }

    if (idx >= 0) {
      _carrinho[idx].qtd     = novaQtd;
      _carrinho[idx].subtotal = novaQtd * preco;
    } else {
      _carrinho.push({ produtoId, nome, preco, qtd, subtotal: qtd * preco });
    }
    input.value = 1;
    renderCarrinho();
    UI.toast(`${nome} adicionado!`, 'success');
  };

  const removerDoCarrinho = idx => {
    _carrinho.splice(idx, 1);
    renderCarrinho();
  };

  const limparCarrinho = () => {
    if (!_carrinho.length) return;
    UI.confirm('Limpar todos os itens do carrinho?', 'Limpar Carrinho', () => {
      _carrinho = [];
      renderCarrinho();
    });
  };

  const renderCarrinho = () => {
    const container = $('#pdv-carrinho-lista');
    if (!_carrinho.length) {
      container.innerHTML = `<div class="empty-state">
        <i class="fa-solid fa-cart-shopping"></i><p>Carrinho vazio</p>
      </div>`;
      _atualizarTotais();
      return;
    }
    container.innerHTML = _carrinho.map((item, idx) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-nome">${sanitize(item.nome)}</div>
          <div class="cart-detalhe">${item.qtd}× ${fmtMoeda(item.preco)}</div>
        </div>
        <span class="cart-item-total">${fmtMoeda(item.subtotal)}</span>
        <button class="btn-remove-cart" data-idx="${idx}" title="Remover">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`).join('');
    _atualizarTotais();
  };

  const _atualizarTotais = () => {
    const total = _carrinho.reduce((acc, i) => acc + i.subtotal, 0);
    $('#pdv-subtotal').textContent = fmtMoeda(total);
    $('#pdv-total').textContent    = fmtMoeda(total);
    _calcularTroco();
  };

  const _calcularTroco = () => {
    const total    = _carrinho.reduce((acc, i) => acc + i.subtotal, 0);
    const recebido = parseFloat($('#pdv-recebido').value) || 0;
    const troco    = recebido - total;
    const trocoEl  = $('#pdv-troco');
    const boxEl    = $('#troco-box');

    trocoEl.textContent = fmtMoeda(Math.max(0, troco));
    if (troco < 0 && recebido > 0) {
      boxEl.style.borderColor = 'var(--red)';
      boxEl.style.background  = 'var(--red-bg)';
      boxEl.style.color       = 'var(--red)';
      trocoEl.textContent = `- ${fmtMoeda(Math.abs(troco))} (insuficiente)`;
    } else {
      boxEl.style.borderColor = 'var(--green)';
      boxEl.style.background  = 'var(--green-bg)';
      boxEl.style.color       = 'var(--green)';
    }
  };

  const finalizarVenda = () => {
    if (!_vendedorId)      { UI.toast('Selecione um vendedor.', 'error'); return; }
    if (!_carrinho.length) { UI.toast('Carrinho vazio!', 'error'); return; }

    const total    = _carrinho.reduce((acc, i) => acc + i.subtotal, 0);
    const recebido = parseFloat($('#pdv-recebido').value) || 0;
    if (recebido < total) { UI.toast('Valor recebido é menor que o total!', 'error'); return; }

    const troco = recebido - total;
    _carrinho.forEach(item => DB.decrementarEstoque(item.produtoId, item.qtd));
    DB.addVenda(_vendedorId, [..._carrinho], total, recebido, troco);

    UI.toast(`Venda finalizada! Troco: ${fmtMoeda(troco)}`, 'success');
    _carrinho = [];
    $('#pdv-recebido').value = '';
    renderCarrinho();
    renderProdutos();   // re-render com produtos atualizados (zera os esgotados)
    ModVendedores.render();
  };

  /* ── Eventos ── */
  $('#pdv-vendedor-select')?.addEventListener('change', e => {
    _vendedorId     = e.target.value;
    _categoriaAtiva = ''; // reset filtro ao trocar vendedor
    _carrinho       = [];
    renderCarrinho();
    renderProdutos();
  });

  $('#pdv-recebido')?.addEventListener('input', _calcularTroco);

  document.addEventListener('click', e => {
    const addBtn = e.target.closest('.btn-add-cart');
    if (addBtn) adicionarAoCarrinho(addBtn.dataset.id);

    const remBtn = e.target.closest('.btn-remove-cart');
    if (remBtn) removerDoCarrinho(parseInt(remBtn.dataset.idx));
  });

  $('#btn-limpar-carrinho')?.addEventListener('click', limparCarrinho);
  $('#btn-finalizar-venda')?.addEventListener('click', finalizarVenda);

  return { renderProdutos };
})();


/* =====================================================
  MÓDULO: Relatórios
  ===================================================== */
const ModRelatorios = (() => {
  const { $, sanitize, fmtMoeda, fmtData } = Utils;
  const TAXA = 0.10;

  const gerar = () => {
    const vendedorFiltro = $('#relatorio-vendedor-select').value;
    const todasVendas    = vendedorFiltro ? DB.getVendasByVendedor(vendedorFiltro) : DB.getVendas();
    const estoqueInicial = DB.getEstoqueInicial();

    const vendidoMap = {};
    todasVendas.forEach(venda => {
      const vendedorNome = DB.getVendedorById(venda.vendedorId)?.nome || '—';
      venda.itens.forEach(item => {
        if (!vendidoMap[item.produtoId]) {
          vendidoMap[item.produtoId] = {
            nome: item.nome,
            vendedorId: venda.vendedorId,
            vendedorNome,
            qtd: 0, preco: item.preco, total: 0,
          };
        }
        vendidoMap[item.produtoId].qtd   += item.qtd;
        vendidoMap[item.produtoId].total += item.subtotal;
      });
    });

    const totalBruto      = Object.values(vendidoMap).reduce((acc, v) => acc + v.total, 0);
    const valorTaxa       = totalBruto * TAXA;
    const totalLiquido    = totalBruto - valorTaxa;
    const totalQtdVendida = Object.values(vendidoMap).reduce((acc, v) => acc + v.qtd, 0);
    const numVendas       = todasVendas.length;

    $('#relatorio-kpis').innerHTML = `
      <div class="kpi-card blue">
        <div class="kpi-label">Total Bruto</div>
        <div class="kpi-value">${fmtMoeda(totalBruto)}</div>
        <i class="fa-solid fa-money-bill-wave kpi-icon"></i>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">Total Líquido (−10%)</div>
        <div class="kpi-value">${fmtMoeda(totalLiquido)}</div>
        <i class="fa-solid fa-sack-dollar kpi-icon"></i>
      </div>
      <div class="kpi-card taxa">
        <div class="kpi-label">Taxa (10%)</div>
        <div class="kpi-value">${fmtMoeda(valorTaxa)}</div>
        <div class="kpi-sub">Bruto − Líquido</div>
        <i class="fa-solid fa-percent kpi-icon"></i>
      </div>
      <div class="kpi-card yellow">
        <div class="kpi-label">Itens Vendidos</div>
        <div class="kpi-value">${totalQtdVendida}</div>
        <i class="fa-solid fa-box kpi-icon"></i>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">Nº de Vendas</div>
        <div class="kpi-value">${numVendas}</div>
        <i class="fa-solid fa-receipt kpi-icon"></i>
      </div>`;

    const tbodyVendidos = $('#relatorio-tbody-vendidos');
    const vendidosArr = Object.values(vendidoMap);
    if (!vendidosArr.length) {
      tbodyVendidos.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhuma venda encontrada</td></tr>`;
    } else {
      tbodyVendidos.innerHTML = vendidosArr.map(v => `
        <tr>
          <td>${sanitize(v.nome)}</td>
          <td>${sanitize(v.vendedorNome)}</td>
          <td><span class="badge badge-blue">${v.qtd}</span></td>
          <td>${fmtMoeda(v.preco)}</td>
          <td style="color:var(--green);font-weight:700">${fmtMoeda(v.total)}</td>
        </tr>`).join('');
    }

    const todosProds = vendedorFiltro
      ? DB.getProdutosByVendedor(vendedorFiltro)
      : DB.getProdutos();

    const tbodyEstoque = $('#relatorio-tbody-estoque');
    if (!todosProds.length) {
      tbodyEstoque.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhum produto</td></tr>`;
    } else {
      tbodyEstoque.innerHTML = todosProds.sort((a,b) => a.nome.localeCompare(b.nome)).map(p => {
        const vendedor = DB.getVendedorById(p.vendedorId);
        const inicial  = estoqueInicial[p.id] ?? p.qtdInicial ?? p.qtd;
        const vendido  = vendidoMap[p.id]?.qtd || 0;
        const restante = p.qtd;
        return `
          <tr>
            <td>${sanitize(p.nome)}</td>
            <td>${sanitize(vendedor?.nome || '—')}</td>
            <td>${inicial}</td>
            <td><span class="badge ${vendido > 0 ? 'badge-green' : 'badge-yellow'}">${vendido}</span></td>
            <td><span class="badge ${restante > 5 ? 'badge-green' : restante > 0 ? 'badge-yellow' : 'badge-red'}">${restante}</span></td>
          </tr>`;
      }).join('');
    }

    $('#relatorio-resultado').style.display = 'block';
  };

  const exportarCSV = () => {
    const vendedorFiltro = $('#relatorio-vendedor-select').value;
    const todasVendas    = vendedorFiltro ? DB.getVendasByVendedor(vendedorFiltro) : DB.getVendas();

    const rows = [['Data', 'Vendedor', 'Produto', 'Qtd', 'Preço Unit.', 'Subtotal', 'Total Venda', 'Recebido', 'Troco']];
    todasVendas.forEach(venda => {
      const vendedorNome = DB.getVendedorById(venda.vendedorId)?.nome || '—';
      venda.itens.forEach(item => {
        rows.push([
          fmtData(venda.data), vendedorNome, item.nome, item.qtd,
          item.preco.toFixed(2).replace('.', ','),
          item.subtotal.toFixed(2).replace('.', ','),
          venda.total.toFixed(2).replace('.', ','),
          venda.recebido.toFixed(2).replace('.', ','),
          venda.troco.toFixed(2).replace('.', ','),
        ]);
      });
    });

    const csv  = rows.map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `relatorio_pdv_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('CSV exportado com sucesso!', 'success');
  };

  $('#btn-gerar-relatorio')?.addEventListener('click', gerar);
  $('#btn-exportar-csv')?.addEventListener('click', exportarCSV);
  $('#btn-imprimir')?.addEventListener('click', () => { gerar(); setTimeout(() => window.print(), 300); });

  return { gerar };
})();


/* =====================================================
  MÓDULO: PWA
  ===================================================== */
const ModPWA = (() => {
  let deferredPrompt;

  const updateOnlineStatus = () => {
    const el = document.getElementById('pwa-status');
    if (!el) return;
    if (navigator.onLine) {
      el.innerHTML = '<i class="fa-solid fa-wifi" style="color:var(--green);font-size:.75rem"></i> <span style="color:var(--green);font-size:.72rem">Online</span>';
    } else {
      el.innerHTML = '<i class="fa-solid fa-wifi-slash" style="color:var(--yellow);font-size:.75rem"></i> <span style="color:var(--yellow);font-size:.72rem">Offline</span>';
    }
  };

  const init = () => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[PWA] SW registrado:', reg.scope))
          .catch(err => console.warn('[PWA] Falha SW:', err));
      });
    }

    updateOnlineStatus();
    window.addEventListener('online',  () => { updateOnlineStatus(); UI.toast('Conexão restaurada!', 'success'); });
    window.addEventListener('offline', () => { updateOnlineStatus(); UI.toast('Modo offline — dados salvos localmente.', 'info'); });

    const pwaBanner  = document.getElementById('pwa-install-banner');
    const btnInstall = document.getElementById('btn-pwa-install');
    const btnClose   = document.getElementById('btn-pwa-close');

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      setTimeout(() => { if (pwaBanner) pwaBanner.style.display = 'flex'; }, 2000);
    });

    btnInstall?.addEventListener('click', async () => {
      if (pwaBanner) pwaBanner.style.display = 'none';
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Usuário: ${outcome}`);
        deferredPrompt = null;
      }
    });

    btnClose?.addEventListener('click', () => { if (pwaBanner) pwaBanner.style.display = 'none'; });
  };

  return { init };
})();


/* =====================================================
  MÓDULO: App
  ===================================================== */
const App = (() => {
  const TITLES = {
    pdv:        'Ponto de Venda',
    vendedores: 'Gestão de Vendedores',
    estoque:    'Gestão de Estoque',
    relatorios: 'Relatórios',
  };

  const _navigate = sectionId => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const section = document.getElementById(`section-${sectionId}`);
    if (section) section.classList.add('active');

    const navItem = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (navItem) navItem.classList.add('active');

    document.getElementById('topbar-title').textContent = TITLES[sectionId] || '';
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  };

  const _initNav = () => {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        _navigate(item.dataset.section);
      });
    });
  };

  const _initHamburger = () => {
    const btn     = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    btn?.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open'); });
    overlay?.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
  };

  const _loadInitialData = () => {
    if (DB.getVendedores().length === 0) _seedDemoData();
    else _migrateCategorias(); // migra produtos antigos sem categoria
  };

  // Migra produtos antigos (sem categoria) para 'Outros'
  const _migrateCategorias = () => {
    const produtos = DB.getProdutos();
    const semCategoria = produtos.filter(p => !p.categoria);
    if (!semCategoria.length) return;
    const updated = produtos.map(p => ({ ...p, categoria: p.categoria || 'Outros' }));
    localStorage.setItem('pdvpro_produtos', JSON.stringify(updated));
  };

  const _seedDemoData = () => {
    const v1 = DB.addVendedor('Maria Silva');
    const v2 = DB.addVendedor('João Pereira');

    DB.addProduto(v1.id, 'Refrigerante 350ml', 5.00, 24, 'Bebidas');
    DB.addProduto(v1.id, 'Suco de Laranja',    4.50, 20, 'Bebidas');
    DB.addProduto(v1.id, 'Água Mineral 500ml', 2.50, 30, 'Bebidas');
    DB.addProduto(v1.id, 'Cerveja Lata',       7.00, 40, 'Bebidas');
    DB.addProduto(v1.id, 'Sorvete Palito',     4.00,  0, 'Gelados'); // demo esgotado

    DB.addProduto(v2.id, 'Coxinha',    6.00, 50, 'Salgados');
    DB.addProduto(v2.id, 'Pastel',     5.50, 40, 'Salgados');
    DB.addProduto(v2.id, 'Espetinho',  8.00, 30, 'Salgados');
    DB.addProduto(v2.id, 'Churros',    4.00, 25, 'Doces');
    DB.addProduto(v2.id, 'Bolo Fatia', 7.50, 15, 'Bolos');

    UI.toast('Dados de demonstração carregados!', 'info');
  };

  const init = () => {
    _loadInitialData();
    _initNav();
    _initHamburger();
    UI.startClock();
    ModPWA.init();
    ModEstoque.init(); // injeta campo categoria no modal

    ModVendedores._refreshSelects();
    ModVendedores.render();

    _navigate('pdv');
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());