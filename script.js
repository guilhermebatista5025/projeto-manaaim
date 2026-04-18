  /**
   * PDV Pro — script.js
   * Arquitetura modular com persistência via localStorage
   * Módulos: DB, Utils, UI, Vendedores, Estoque, PDV, Relatórios, App
   */

  'use strict';

  /* =====================================================
    MÓDULO: DB — Camada de persistência (localStorage)
    ===================================================== */
  const DB = (() => {
    const KEYS = {
      vendedores: 'pdvpro_vendedores',
      produtos:   'pdvpro_produtos',
      vendas:     'pdvpro_vendas',
      estoque_ini:'pdvpro_estoque_ini',
    };

    const get  = key => JSON.parse(localStorage.getItem(key) || '[]');
    const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
    const genId = () => '_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

    // --- Vendedores ---
    const getVendedores = () => get(KEYS.vendedores);
    const saveVendedores = list => save(KEYS.vendedores, list);
    const addVendedor = nome => {
      const list = getVendedores();
      const v = { id: genId(), nome: nome.trim() };
      list.push(v);
      saveVendedores(list);
      return v;
    };
    const updateVendedor = (id, nome) => {
      const list = getVendedores().map(v => v.id === id ? { ...v, nome: nome.trim() } : v);
      saveVendedores(list);
    };
    const deleteVendedor = id => {
      saveVendedores(getVendedores().filter(v => v.id !== id));
      saveProdutos(getProdutos().filter(p => p.vendedorId !== id));
    };
    const getVendedorById = id => getVendedores().find(v => v.id === id);

    // --- Produtos ---
    const getProdutos = () => get(KEYS.produtos);
    const saveProdutos = list => save(KEYS.produtos, list);
    const getProdutosByVendedor = vid => getProdutos().filter(p => p.vendedorId === vid);
    const addProduto = (vendedorId, nome, preco, qtd) => {
      const list = getProdutos();
      const p = { id: genId(), vendedorId, nome: nome.trim(), preco: +preco, qtd: +qtd, qtdInicial: +qtd };
      list.push(p);
      saveProdutos(list);
      _snapshotEstoque(p.id, +qtd);
      return p;
    };
    const updateProduto = (id, nome, preco, qtd) => {
      const list = getProdutos().map(p => {
        if (p.id !== id) return p;
        const novaQtd = +qtd;
        if (novaQtd > p.qtd) _snapshotEstoque(id, novaQtd);
        return { ...p, nome: nome.trim(), preco: +preco, qtd: novaQtd };
      });
      saveProdutos(list);
    };
    const deleteProduto = id => saveProdutos(getProdutos().filter(p => p.id !== id));
    const getProdutoById = id => getProdutos().find(p => p.id === id);
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
    const getVendas = () => get(KEYS.vendas);
    const addVenda = (vendedorId, itens, total, recebido, troco) => {
      const list = getVendas();
      const v = {
        id: genId(),
        vendedorId,
        itens,
        total,
        recebido,
        troco,
        data: new Date().toISOString(),
      };
      list.push(v);
      save(KEYS.vendas, list);
      return v;
    };
    const getVendasByVendedor = vid => getVendas().filter(v => v.vendedorId === vid);

    return {
      getVendedores, addVendedor, updateVendedor, deleteVendedor, getVendedorById,
      getProdutos, getProdutosByVendedor, addProduto, updateProduto, deleteProduto,
      getProdutoById, decrementarEstoque,
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
    const closeAllModals = () => document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));

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
        vendedores.map(v => `<option value="${v.id}" ${v.id === selectedId ? 'selected' : ''}>${Utils.sanitize(v.nome)}</option>`).join('');
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
        const produtos = DB.getProdutosByVendedor(v.id);
        const vendas   = DB.getVendasByVendedor(v.id);
        const totalVendido = vendas.reduce((acc, venda) => acc + venda.total, 0);
        return `
          <div class="vendedor-card" data-id="${v.id}">
            <div class="vendedor-avatar">${sanitize(initials(v.nome))}</div>
            <div class="vendedor-nome">${sanitize(v.nome)}</div>
            <div class="vendedor-stats">
              <span><i class="fa-solid fa-box" style="width:14px"></i> ${produtos.length} produto(s)</span>
              <span><i class="fa-solid fa-receipt" style="width:14px"></i> ${vendas.length} venda(s)</span>
              <span style="color:var(--green)"><i class="fa-solid fa-dollar-sign" style="width:14px"></i> ${fmtMoeda(totalVendido)}</span>
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

    const renderTabela = () => {
      const tbody = $('#estoque-tbody');
      const produtos = DB.getProdutosByVendedor(_vendedorAtivo);
      if (!produtos.length) {
        tbody.innerHTML = `<tr><td colspan="4">
          <div class="empty-state"><i class="fa-solid fa-box-open"></i><p>Nenhum produto cadastrado</p></div>
        </td></tr>`;
        return;
      }
      tbody.innerHTML = produtos.map(p => `
        <tr>
          <td>${sanitize(p.nome)}</td>
          <td>${fmtMoeda(p.preco)}</td>
          <td>
            <span class="badge ${p.qtd > 5 ? 'badge-green' : p.qtd > 0 ? 'badge-yellow' : 'badge-red'}">
              ${p.qtd}
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
    };

    const openNew = () => {
      $('#modal-produto-titulo').textContent = 'Novo Produto';
      $('#produto-id-edit').value = '';
      $('#produto-nome-input').value = '';
      $('#produto-preco-input').value = '';
      $('#produto-qtd-input').value = '';
      UI.openModal('modal-produto');
    };

    const openEdit = id => {
      const p = DB.getProdutoById(id);
      if (!p) return;
      $('#modal-produto-titulo').textContent = 'Editar Produto';
      $('#produto-id-edit').value = p.id;
      $('#produto-nome-input').value = p.nome;
      $('#produto-preco-input').value = p.preco;
      $('#produto-qtd-input').value = p.qtd;
      UI.openModal('modal-produto');
    };

    const save = () => {
      const nome  = $('#produto-nome-input').value.trim();
      const preco = parseFloat($('#produto-preco-input').value);
      const qtd   = parseInt($('#produto-qtd-input').value);
      if (!nome)          { UI.toast('Informe o nome do produto.', 'error'); return; }
      if (isNaN(preco) || preco < 0) { UI.toast('Preço inválido.', 'error'); return; }
      if (isNaN(qtd)   || qtd < 0)  { UI.toast('Quantidade inválida.', 'error'); return; }

      const id = $('#produto-id-edit').value;
      if (id) {
        DB.updateProduto(id, nome, preco, qtd);
        UI.toast('Produto atualizado!', 'success');
      } else {
        DB.addProduto(_vendedorAtivo, nome, preco, qtd);
        UI.toast('Produto adicionado!', 'success');
      }
      UI.closeModal('modal-produto');
      renderTabela();
      ModPDV.renderProdutos();
    };

    const del = id => {
      const p = DB.getProdutoById(id);
      if (!p) return;
      UI.confirm(`Excluir o produto "${p.nome}"?`, 'Excluir Produto', () => {
        DB.deleteProduto(id);
        UI.toast('Produto removido.', 'info');
        renderTabela();
        ModPDV.renderProdutos();
      });
    };

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
      }
    });

    $('#btn-novo-produto')?.addEventListener('click', openNew);
    $('#btn-salvar-produto')?.addEventListener('click', save);

    document.addEventListener('click', e => {
      if (e.target.closest('.btn-edit-produto')) openEdit(e.target.closest('.btn-edit-produto').dataset.id);
      if (e.target.closest('.btn-del-produto'))  del(e.target.closest('.btn-del-produto').dataset.id);
    });

    return { renderTabela };
  })();


  /* =====================================================
    MÓDULO: PDV
    ===================================================== */
  const ModPDV = (() => {
    const { $, sanitize, fmtMoeda } = Utils;
    let _carrinho = [];
    let _vendedorId = '';

    const renderProdutos = () => {
      const container = $('#pdv-produto-lista');
      if (!_vendedorId) {
        container.innerHTML = `<div class="empty-state">
          <i class="fa-solid fa-store-slash"></i><p>Selecione um vendedor para ver os produtos</p>
        </div>`;
        return;
      }
      const produtos = DB.getProdutosByVendedor(_vendedorId);
      if (!produtos.length) {
        container.innerHTML = `<div class="empty-state">
          <i class="fa-solid fa-box-open"></i><p>Nenhum produto cadastrado para este vendedor</p>
        </div>`;
        return;
      }
      container.innerHTML = produtos.map(p => `
        <div class="produto-item" data-id="${p.id}">
          <div class="produto-info">
            <span class="produto-nome">${sanitize(p.nome)}</span>
            <span class="produto-preco">${fmtMoeda(p.preco)} · Estoque: ${p.qtd}</span>
          </div>
          <input type="number" class="input-styled produto-qtd-input" value="1" min="1" max="${p.qtd}" step="1"
            data-id="${p.id}" data-preco="${p.preco}" data-nome="${sanitize(p.nome)}" data-estoque="${p.qtd}" />
          <button class="btn-add-cart" data-id="${p.id}" title="Adicionar ao carrinho" ${p.qtd === 0 ? 'disabled style="opacity:.4"' : ''}>
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>`).join('');
    };

    const adicionarAoCarrinho = produtoId => {
      const input = $(`.produto-qtd-input[data-id="${produtoId}"]`);
      if (!input) return;
      const qtd = parseInt(input.value);
      const preco = parseFloat(input.dataset.preco);
      const nome  = input.dataset.nome;
      const estoque = parseInt(input.dataset.estoque);

      if (isNaN(qtd) || qtd <= 0)       { UI.toast('Informe uma quantidade válida.', 'error'); return; }
      if (qtd > estoque)                 { UI.toast(`Estoque insuficiente (máx. ${estoque}).`, 'error'); return; }

      const idx = _carrinho.findIndex(i => i.produtoId === produtoId);
      const novaQtd = idx >= 0 ? _carrinho[idx].qtd + qtd : qtd;
      if (novaQtd > estoque) {
        UI.toast(`Estoque insuficiente. Já tem ${_carrinho[idx]?.qtd || 0} no carrinho.`, 'error');
        return;
      }

      if (idx >= 0) {
        _carrinho[idx].qtd = novaQtd;
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
      if (!_vendedorId)    { UI.toast('Selecione um vendedor.', 'error'); return; }
      if (!_carrinho.length) { UI.toast('Carrinho vazio!', 'error'); return; }

      const total    = _carrinho.reduce((acc, i) => acc + i.subtotal, 0);
      const recebido = parseFloat($('#pdv-recebido').value) || 0;
      if (recebido < total) {
        UI.toast('Valor recebido é menor que o total!', 'error'); return;
      }

      const troco = recebido - total;
      _carrinho.forEach(item => DB.decrementarEstoque(item.produtoId, item.qtd));
      DB.addVenda(_vendedorId, [..._carrinho], total, recebido, troco);

      UI.toast(`Venda finalizada! Troco: ${fmtMoeda(troco)}`, 'success');
      _carrinho = [];
      $('#pdv-recebido').value = '';
      renderCarrinho();
      renderProdutos();
      ModVendedores.render();
    };

    $('#pdv-vendedor-select')?.addEventListener('change', e => {
      _vendedorId = e.target.value;
      _carrinho = [];
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
    const TAXA = 0.10; // 10%

    const gerar = () => {
      const vendedorFiltro = $('#relatorio-vendedor-select').value;
      const todasVendas    = vendedorFiltro ? DB.getVendasByVendedor(vendedorFiltro) : DB.getVendas();
      const estoqueInicial = DB.getEstoqueInicial();

      // Consolidar produtos vendidos
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

      const totalBruto     = Object.values(vendidoMap).reduce((acc, v) => acc + v.total, 0);
      const valorTaxa      = totalBruto * TAXA;           // ← valor real da taxa (10%)
      const totalLiquido   = totalBruto - valorTaxa;      // bruto − taxa
      const totalQtdVendida = Object.values(vendidoMap).reduce((acc, v) => acc + v.qtd, 0);
      const numVendas      = todasVendas.length;

      // KPI Cards — agora com 5 cards incluindo Taxa
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

      // Tabela de vendidos
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

      // Tabela de estoque restante
      const todosProds = vendedorFiltro
        ? DB.getProdutosByVendedor(vendedorFiltro)
        : DB.getProdutos();

      const tbodyEstoque = $('#relatorio-tbody-estoque');
      if (!todosProds.length) {
        tbodyEstoque.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nenhum produto</td></tr>`;
      } else {
        tbodyEstoque.innerHTML = todosProds.map(p => {
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
            fmtData(venda.data),
            vendedorNome,
            item.nome,
            item.qtd,
            item.preco.toFixed(2).replace('.', ','),
            item.subtotal.toFixed(2).replace('.', ','),
            venda.total.toFixed(2).replace('.', ','),
            venda.recebido.toFixed(2).replace('.', ','),
            venda.troco.toFixed(2).replace('.', ','),
          ]);
        });
      });

      const csv = rows.map(r => r.map(c => `"${c}"`).join(';')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `relatorio_pdv_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('CSV exportado com sucesso!', 'success');
    };

    $('#btn-gerar-relatorio')?.addEventListener('click', gerar);
    $('#btn-exportar-csv')?.addEventListener('click', exportarCSV);
    $('#btn-imprimir')?.addEventListener('click', () => {
      gerar();
      setTimeout(() => window.print(), 300);
    });

    return { gerar };
  })();


  /* =====================================================
    MÓDULO: PWA — Service Worker + Lógica do Banner
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
      // Registra Service Worker
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[PWA] Service Worker registrado:', reg.scope))
            .catch(err => console.warn('[PWA] Falha no registro do SW:', err));
        });
      }

      // Status online/offline
      updateOnlineStatus();
      window.addEventListener('online',  () => { updateOnlineStatus(); UI.toast('Conexão restaurada!', 'success'); });
      window.addEventListener('offline', () => { updateOnlineStatus(); UI.toast('Modo offline — dados salvos localmente.', 'info'); });

      // Lógica do Banner Profissional de Instalação
      const pwaBanner = document.getElementById('pwa-install-banner');
      const btnInstall = document.getElementById('btn-pwa-install');
      const btnClose = document.getElementById('btn-pwa-close');

      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        
        setTimeout(() => {
          if (pwaBanner) pwaBanner.style.display = 'flex';
        }, 2000);
      });

      if (btnInstall) {
        btnInstall.addEventListener('click', async () => {
          if (pwaBanner) pwaBanner.style.display = 'none';
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Usuário escolheu: ${outcome}`);
            deferredPrompt = null;
          }
        });
      }

      if (btnClose) {
        btnClose.addEventListener('click', () => {
          if (pwaBanner) pwaBanner.style.display = 'none';
        });
      }
    };

    return { init };
  })();

  /* =====================================================
    MÓDULO: App — Inicialização e navegação
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
      btn?.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
      overlay?.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    };

    const _loadInitialData = () => {
      if (DB.getVendedores().length === 0) {
        _seedDemoData();
      }
    };

    const _seedDemoData = () => {
      const v1 = DB.addVendedor('Maria Silva');
      const v2 = DB.addVendedor('João Pereira');

      DB.addProduto(v1.id, 'Refrigerante 350ml', 5.00, 24);
      DB.addProduto(v1.id, 'Suco de Laranja', 4.50, 20);
      DB.addProduto(v1.id, 'Água Mineral 500ml', 2.50, 30);
      DB.addProduto(v1.id, 'Cerveja Lata', 7.00, 40);

      DB.addProduto(v2.id, 'Coxinha', 6.00, 50);
      DB.addProduto(v2.id, 'Pastel', 5.50, 40);
      DB.addProduto(v2.id, 'Espetinho', 8.00, 30);
      DB.addProduto(v2.id, 'Churros', 4.00, 25);

      UI.toast('Dados de demonstração carregados!', 'info');
    };

    const init = () => {
      _loadInitialData();
      _initNav();
      _initHamburger();
      UI.startClock();
      ModPWA.init();

      ModVendedores._refreshSelects();
      ModVendedores.render();

      _navigate('pdv');
    };

    return { init };
  })();

  // A MÁGICA ACONTECE AQUI: Inicia o sistema e o menu assim que a página carregar
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });