/**
 * PDV Pro — Módulo Caixa
 * Controle de Abertura/Fechamento e Histórico de Relatórios
 *
 * Como usar:
 *   1. Adicione <link rel="stylesheet" href="caixa.css"> no <head>
 *   2. Adicione <script src="caixa.js"></script> APÓS script.js no <body>
 *
 * Dependências: DB, Utils, UI (do script.js)
 */

'use strict';

/* =====================================================
  MÓDULO: Caixa
  ===================================================== */
const ModCaixa = (() => {

    /* ---------- CONSTANTES ---------- */
    const KEYS = {
        config: 'pdvpro_caixa_config',
        historico: 'pdvpro_historico',
        lastCheck: 'pdvpro_last_encerramento',
    };

    const DEFAULT_CONFIG = {
        usarPadrao: true,
        abertura: '07:30',
        fechamento: '00:00',
    };

    const TAXA = 0.10;

    /* ---------- ESTADO ---------- */
    let _monitorInterval = null;
    let _warningShown = false;
    let _encerradoHoje = false;

    /* ---------- PERSISTÊNCIA ---------- */
    const getConfig = () => {
        try {
            return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(KEYS.config) || '{}') };
        } catch { return { ...DEFAULT_CONFIG }; }
    };

    const saveConfig = cfg => localStorage.setItem(KEYS.config, JSON.stringify(cfg));

    const getHistorico = () => {
        try { return JSON.parse(localStorage.getItem(KEYS.historico) || '[]'); }
        catch { return []; }
    };

    const saveHistorico = list => localStorage.setItem(KEYS.historico, JSON.stringify(list));

    const getLastCheck = () => localStorage.getItem(KEYS.lastCheck) || '';
    const setLastCheck = d => localStorage.setItem(KEYS.lastCheck, d);

    /* ---------- UTILITÁRIOS ---------- */
    const now = () => new Date();

    const hojeStr = () => {
        const d = now();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const parseHorario = str => {
        const [h, m] = (str || '00:00').split(':').map(Number);
        return { h, m };
    };

    const horarioToMinutes = str => {
        const { h, m } = parseHorario(str);
        return h * 60 + m;
    };

    const currentMinutes = () => {
        const d = now();
        return d.getHours() * 60 + d.getMinutes();
    };

    const fmtMoeda = v => `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    const fmtDataBr = iso => new Date(iso).toLocaleString('pt-BR');
    const fmtDateKey = iso => {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const sanitize = str => String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');

    /* ---------- SNAPSHOT DO RELATÓRIO ATUAL ---------- */
    const _tirarSnapshot = () => {
        const cfg = getConfig();
        const vendas = DB.getVendas();
        const produtos = DB.getProdutos();
        const vendedores = DB.getVendedores();
        const estIni = DB.getEstoqueInicial();

        // Consolidar vendidos
        const vendidoMap = {};
        vendas.forEach(venda => {
            const vNome = DB.getVendedorById(venda.vendedorId)?.nome || '—';
            venda.itens.forEach(item => {
                if (!vendidoMap[item.produtoId]) {
                    vendidoMap[item.produtoId] = {
                        nome: item.nome,
                        vendedorId: venda.vendedorId,
                        vendedorNome: vNome,
                        qtd: 0,
                        preco: item.preco,
                        total: 0,
                    };
                }
                vendidoMap[item.produtoId].qtd += item.qtd;
                vendidoMap[item.produtoId].total += item.subtotal;
            });
        });

        const totalBruto = Object.values(vendidoMap).reduce((a, v) => a + v.total, 0);
        const valorTaxa = totalBruto * TAXA;
        const totalLiquido = totalBruto - valorTaxa;
        const totalQtdVendida = Object.values(vendidoMap).reduce((a, v) => a + v.qtd, 0);

        // Stats por vendedor
        const vendedorStats = vendedores.map(v => {
            const vv = vendas.filter(x => x.vendedorId === v.id);
            return {
                id: v.id,
                nome: v.nome,
                numVendas: vv.length,
                totalVendido: vv.reduce((a, x) => a + x.total, 0),
            };
        });

        // Estoque snapshot
        const estoqueSnap = produtos.map(p => {
            const vendedor = DB.getVendedorById(p.vendedorId);
            const inicial = estIni[p.id] ?? p.qtdInicial ?? p.qtd;
            const vendido = vendidoMap[p.id]?.qtd || 0;
            return {
                id: p.id,
                nome: p.nome,
                vendedorNome: vendedor?.nome || '—',
                qtdInicial: inicial,
                qtdVendida: vendido,
                qtdRestante: p.qtd,
            };
        });

        const snapshot = {
            id: '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
            dataCriacao: now().toISOString(),
            dataHoje: hojeStr(),
            horarioAbertura: cfg.abertura,
            horarioFechamento: cfg.fechamento,
            totalBruto,
            valorTaxa,
            totalLiquido,
            totalQtdVendida,
            numVendas: vendas.length,
            vendedorStats,
            produtosVendidos: Object.values(vendidoMap),
            estoqueSnap,
        };

        return snapshot;
    };

    /* ---------- ENCERRAR CAIXA ---------- */
    const encerrarCaixa = (manual = false) => {
        const snapshot = _tirarSnapshot();

        if (snapshot.numVendas === 0 && !manual) {
            // Não salva snapshot vazio no encerramento automático
            setLastCheck(hojeStr());
            _encerradoHoje = true;
            _atualizarStatus();
            return;
        }

        const historico = getHistorico();
        historico.unshift(snapshot); // mais recente primeiro
        saveHistorico(historico);

        setLastCheck(hojeStr());
        _encerradoHoje = true;

        _atualizarStatus();
        _atualizarBadgeHistorico();
        _mostrarBanner('Caixa encerrado! Relatório salvo no histórico.', 'success');

        if (typeof UI !== 'undefined') {
            UI.toast('Caixa encerrado. Relatório salvo no histórico!', 'success');
        }

        return snapshot;
    };

    /* ---------- STATUS DO CAIXA ---------- */
    const getCaixaStatus = () => {
        const cfg = getConfig();
        const aberMinutos = horarioToMinutes(cfg.abertura);
        const fechMinutos = horarioToMinutes(cfg.fechamento);
        const agora = currentMinutes();

        if (_encerradoHoje || getLastCheck() === hojeStr()) {
            return 'fechado';
        }

        // Lógica: se fechamento < abertura (ex: fecha 00:00), vai até meia noite
        let aberto;
        if (fechMinutos < aberMinutos) {
            // Cruza meia-noite: aberto se >= abertura OU < fechamento
            aberto = agora >= aberMinutos || agora < fechMinutos;
        } else {
            aberto = agora >= aberMinutos && agora < fechMinutos;
        }

        return aberto ? 'aberto' : 'aguardando';
    };

    /* ---------- MONITOR DE HORÁRIO ---------- */
    const _iniciarMonitor = () => {
        if (_monitorInterval) clearInterval(_monitorInterval);

        // Reset flag de encerramento à meia-noite
        const todayKey = hojeStr();
        if (getLastCheck() !== todayKey) {
            _encerradoHoje = false;
        }

        _monitorInterval = setInterval(() => {
            const cfg = getConfig();
            const fechMinutos = horarioToMinutes(cfg.fechamento);
            const agora = currentMinutes();
            const todayKey = hojeStr();

            // Verifica se já encerrou hoje
            if (getLastCheck() === todayKey) {
                _encerradoHoje = true;
                _atualizarStatus();
                _atualizarCountdown(null);
                return;
            }

            // Aviso 15 minutos antes do fechamento
            const minutosParaFecha = (fechMinutos - agora + 1440) % 1440;
            if (minutosParaFecha <= 15 && minutosParaFecha > 0 && !_warningShown) {
                _warningShown = true;
                _mostrarBanner(`Caixa encerra em ${minutosParaFecha} minutos!`, 'warning');
                if (typeof UI !== 'undefined') {
                    UI.toast(`Atenção: caixa encerra em ${minutosParaFecha} minutos!`, 'info');
                }
            }

            // Reset aviso se estiver longe do fechamento
            if (minutosParaFecha > 15) {
                _warningShown = false;
            }

            // Atualiza countdown
            _atualizarCountdown(minutosParaFecha <= 30 ? minutosParaFecha : null);

            // Hora de encerrar
            if (agora === fechMinutos) {
                encerrarCaixa(false);
            }

            _atualizarStatus();
        }, 15000); // verifica a cada 15 segundos

        // Primeira verificação imediata
        _atualizarStatus();
    };

    /* ---------- ATUALIZAR UI STATUS ---------- */
    const _atualizarStatus = () => {
        const statusEl = document.getElementById('caixa-status-bar');
        if (!statusEl) return;

        const status = getCaixaStatus();
        const cfg = getConfig();

        statusEl.className = `caixa-status-bar ${status}`;

        const labels = {
            aberto: `<span class="caixa-status-dot"></span> Caixa Aberto <span class="caixa-horario-info">(até ${cfg.fechamento})</span>`,
            fechado: `<span class="caixa-status-dot"></span> Caixa Encerrado`,
            aguardando: `<span class="caixa-status-dot"></span> Aguardando Abertura <span class="caixa-horario-info">(${cfg.abertura})</span>`,
        };

        statusEl.innerHTML = labels[status] || labels.aguardando;
    };

    const _atualizarCountdown = (minutos) => {
        const el = document.getElementById('caixa-countdown');
        if (!el) return;
        if (minutos === null || minutos <= 0) {
            el.classList.remove('visible');
            return;
        }
        el.classList.add('visible');
        el.innerHTML = `<i class="fa-solid fa-clock"></i> Encerra em ${minutos} min`;
    };

    const _atualizarBadgeHistorico = () => {
        const badge = document.querySelector('#btn-historico .historico-badge');
        if (!badge) return;
        const count = getHistorico().length;
        badge.textContent = count > 9 ? '9+' : count;
        if (count > 0) badge.classList.add('visible');
        else badge.classList.remove('visible');
    };

    /* ---------- BANNER DE NOTIFICAÇÃO ---------- */
    const _mostrarBanner = (msg, tipo = 'success') => {
        let banner = document.getElementById('caixa-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'caixa-banner';
            banner.className = 'caixa-encerramento-banner';
            banner.innerHTML = `
        <div class="banner-icon ${tipo}" id="caixa-banner-icon"><i class="fa-solid fa-cash-register"></i></div>
        <div class="banner-text">
          <strong id="caixa-banner-msg"></strong>
          <span id="caixa-banner-sub"></span>
        </div>
        <button class="banner-close" onclick="this.closest('.caixa-encerramento-banner').classList.remove('visible')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
            document.body.appendChild(banner);
        }

        const iconEl = document.getElementById('caixa-banner-icon');
        const msgEl = document.getElementById('caixa-banner-msg');
        const subEl = document.getElementById('caixa-banner-sub');

        iconEl.className = `banner-icon ${tipo}`;
        iconEl.innerHTML = tipo === 'warning'
            ? '<i class="fa-solid fa-triangle-exclamation"></i>'
            : '<i class="fa-solid fa-check-circle"></i>';
        msgEl.textContent = msg;
        subEl.textContent = `Horário: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        banner.className = `caixa-encerramento-banner ${tipo} visible`;

        setTimeout(() => banner.classList.remove('visible'), 6000);
    };

    /* ---------- INJECT HTML ---------- */
    const _injectHTML = () => {
        // 1. Status bar no topbar
        const topbarActions = document.querySelector('.topbar-actions');
        if (topbarActions) {
            const statusWrap = document.createElement('div');
            statusWrap.style.display = 'flex';
            statusWrap.style.alignItems = 'center';
            statusWrap.style.gap = '8px';
            statusWrap.innerHTML = `
        <div id="caixa-countdown" class="caixa-countdown"></div>
        <div id="caixa-status-bar" class="caixa-status-bar aguardando">
          <span class="caixa-status-dot"></span>
          Carregando...
        </div>
      `;
            topbarActions.prepend(statusWrap);
        }

        // 2. Botões na seção de relatórios (filter-actions)
        const filterActions = document.querySelector('.filter-actions');
        if (filterActions) {
            const btnAF = document.createElement('button');
            btnAF.className = 'btn-secondary';
            btnAF.id = 'btn-abertura-fechamento';
            btnAF.innerHTML = '<i class="fa-solid fa-store"></i> Abertura/Fechamento';

            const btnHist = document.createElement('button');
            btnHist.className = 'btn-secondary';
            btnHist.id = 'btn-historico';
            btnHist.innerHTML = `
        <i class="fa-solid fa-clock-rotate-left"></i> Histórico
        <span class="historico-badge">0</span>
      `;

            filterActions.appendChild(btnAF);
            filterActions.appendChild(btnHist);
        }

        // 3. Modal Abertura/Fechamento
        const modalCaixa = document.createElement('div');
        modalCaixa.className = 'modal-overlay';
        modalCaixa.id = 'modal-caixa';
        modalCaixa.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3><i class="fa-solid fa-store" style="color:var(--accent);margin-right:8px"></i> Configurar Caixa</h3>
          <button class="btn-icon modal-close" data-modal="modal-caixa">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="caixa-config-header">
            <div class="caixa-icon-wrap"><i class="fa-solid fa-clock"></i></div>
            <div class="caixa-config-header-text">
              <h4>Horário de Funcionamento</h4>
              <p>Define quando o caixa abre e encerra automaticamente</p>
            </div>
          </div>

          <div style="padding:0 20px 4px">
            <!-- Checkbox padrão -->
            <label class="checkbox-padrao" id="label-padrao">
              <input type="checkbox" id="caixa-usar-padrao">
              <div class="checkbox-visual"></div>
              <div class="checkbox-text">
                <strong>Usar horário padrão (07:30 às 00:00)</strong>
                <span>Abertura às 07h30 e encerramento à meia-noite</span>
              </div>
            </label>

            <!-- Inputs de horário -->
            <div class="horario-grid">
              <div class="horario-field">
                <label for="caixa-abertura">
                  <i class="fa-solid fa-sun"></i> Abertura
                </label>
                <input type="time" id="caixa-abertura" class="horario-input" value="07:30">
              </div>
              <div class="horario-separator"><i class="fa-solid fa-arrow-right"></i></div>
              <div class="horario-field">
                <label for="caixa-fechamento">
                  <i class="fa-solid fa-moon"></i> Fechamento
                </label>
                <input type="time" id="caixa-fechamento" class="horario-input" value="00:00">
              </div>
            </div>

            <!-- Preview -->
            <div class="horario-preview">
              <div class="horario-preview-item">
                <span class="horario-preview-label">Abertura</span>
                <span class="horario-preview-time abertura-color" id="preview-abertura">07:30</span>
              </div>
              <div class="horario-preview-divider"><i class="fa-solid fa-arrow-right-long"></i></div>
              <div class="horario-preview-item">
                <span class="horario-preview-label">Fechamento</span>
                <span class="horario-preview-time fechamento-color" id="preview-fechamento">00:00</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;align-items:center">
          <button class="btn-danger" id="btn-encerrar-manual" title="Encerrar caixa agora e salvar relatório">
            <i class="fa-solid fa-power-off"></i> Encerrar Agora
          </button>
          <div style="display:flex;gap:10px">
            <button class="btn-secondary modal-close" data-modal="modal-caixa">Cancelar</button>
            <button class="btn-primary" id="btn-salvar-caixa">
              <i class="fa-solid fa-floppy-disk"></i> Salvar
            </button>
          </div>
        </div>
      </div>
    `;
        document.body.appendChild(modalCaixa);

        // 4. Modal Histórico
        const modalHistorico = document.createElement('div');
        modalHistorico.className = 'modal-overlay';
        modalHistorico.id = 'modal-historico';
        modalHistorico.innerHTML = `
      <div class="modal" style="max-width:820px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-header">
          <h3><i class="fa-solid fa-clock-rotate-left" style="color:var(--accent);margin-right:8px"></i> Histórico de Relatórios</h3>
          <button class="btn-icon modal-close" data-modal="modal-historico">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="historico-toolbar">
          <div class="historico-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="historico-search-input" placeholder="Buscar por data ou vendedor...">
          </div>
          <span class="historico-count" id="historico-count">0 relatórios</span>
          <button class="btn-secondary btn-sm" id="btn-limpar-historico" style="font-size:0.78rem;padding:6px 12px">
            <i class="fa-solid fa-trash"></i> Limpar Tudo
          </button>
        </div>

        <div class="modal-body" style="overflow-y:auto;flex:1;padding:0">
          <div id="historico-lista" style="padding:16px 20px;display:flex;flex-direction:column;gap:10px"></div>
        </div>
      </div>
    `;
        document.body.appendChild(modalHistorico);
    };

    /* ---------- CARREGAR CONFIG NO MODAL ---------- */
    const _carregarConfigNoModal = () => {
        const cfg = getConfig();
        const cbPadrao = document.getElementById('caixa-usar-padrao');
        const inputAb = document.getElementById('caixa-abertura');
        const inputFech = document.getElementById('caixa-fechamento');

        if (!cbPadrao) return;

        cbPadrao.checked = cfg.usarPadrao;
        inputAb.value = cfg.abertura;
        inputFech.value = cfg.fechamento;
        _toggleInputsHorario(cfg.usarPadrao);
        _atualizarPreview();
    };

    const _toggleInputsHorario = (desabilitar) => {
        const inputAb = document.getElementById('caixa-abertura');
        const inputFech = document.getElementById('caixa-fechamento');
        if (!inputAb) return;
        inputAb.disabled = desabilitar;
        inputFech.disabled = desabilitar;
        if (desabilitar) {
            inputAb.value = '07:30';
            inputFech.value = '00:00';
            _atualizarPreview();
        }
    };

    const _atualizarPreview = () => {
        const ab = document.getElementById('caixa-abertura')?.value || '07:30';
        const fech = document.getElementById('caixa-fechamento')?.value || '00:00';
        const pa = document.getElementById('preview-abertura');
        const pf = document.getElementById('preview-fechamento');
        if (pa) pa.textContent = ab;
        if (pf) pf.textContent = fech;
    };

    /* ---------- SALVAR CONFIG ---------- */
    const _salvarConfig = () => {
        const cbPadrao = document.getElementById('caixa-usar-padrao');
        const inputAb = document.getElementById('caixa-abertura');
        const inputFech = document.getElementById('caixa-fechamento');

        const usarPadrao = cbPadrao?.checked ?? true;
        const abertura = usarPadrao ? '07:30' : (inputAb?.value || '07:30');
        const fechamento = usarPadrao ? '00:00' : (inputFech?.value || '00:00');

        saveConfig({ usarPadrao, abertura, fechamento });

        // Resetar flag se hoje ainda não encerrou
        if (getLastCheck() === hojeStr()) {
            localStorage.removeItem(KEYS.lastCheck);
            _encerradoHoje = false;
        }

        _atualizarStatus();

        if (typeof UI !== 'undefined') {
            UI.closeModal('modal-caixa');
            UI.toast(`Horário salvo: ${abertura} → ${fechamento}`, 'success');
        }
    };

    /* ---------- RENDERIZAR HISTÓRICO ---------- */
    const _renderHistorico = (filtro = '') => {
        const lista = document.getElementById('historico-lista');
        const countEl = document.getElementById('historico-count');
        if (!lista) return;

        let historico = getHistorico();

        // Filtro
        if (filtro.trim()) {
            const f = filtro.trim().toLowerCase();
            historico = historico.filter(h => {
                const dataStr = fmtDateKey(h.dataCriacao).toLowerCase();
                const vends = (h.vendedorStats || []).map(v => v.nome.toLowerCase()).join(' ');
                return dataStr.includes(f) || vends.includes(f);
            });
        }

        if (countEl) countEl.textContent = `${historico.length} relatório(s)`;

        if (!historico.length) {
            lista.innerHTML = `
        <div class="historico-empty">
          <div class="historico-empty-icon"><i class="fa-solid fa-box-open"></i></div>
          <h4>Nenhum relatório encontrado</h4>
          <p>${filtro ? 'Tente outro termo de busca.' : 'Os relatórios aparecerão aqui após o encerramento do caixa.'}</p>
        </div>
      `;
            return;
        }

        lista.innerHTML = historico.map((h, idx) => {
            const d = new Date(h.dataCriacao);
            const dia = String(d.getDate()).padStart(2, '0');
            const mes = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
            const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const vendNomes = (h.vendedorStats || [])
                .filter(v => v.numVendas > 0)
                .map(v => sanitize(v.nome))
                .join(', ') || '—';

            // Produtos vendidos (top 3)
            const prods = (h.produtosVendidos || []).slice(0, 20);

            // Estoque
            const estoqueRows = (h.estoqueSnap || []).slice(0, 20);

            // Vendedores stats
            const vendStats = (h.vendedorStats || []);

            return `
        <div class="historico-item" data-idx="${idx}" id="hist-item-${h.id}">
          <div class="historico-item-header" onclick="ModCaixa.toggleHistItem('${h.id}')">
            <div class="historico-date-badge">
              <span class="historico-date-day">${dia}</span>
              <span class="historico-date-month">${mes}</span>
            </div>
            <div class="historico-item-info">
              <div class="historico-item-title">Relatório de ${fmtDateKey(h.dataCriacao)}</div>
              <div class="historico-item-sub">
                <span><i class="fa-solid fa-clock"></i> Encerrado às ${hora}</span>
                <span><i class="fa-solid fa-store"></i> ${h.horarioAbertura || '—'} → ${h.horarioFechamento || '—'}</span>
                <span><i class="fa-solid fa-users"></i> ${vendNomes}</span>
              </div>
            </div>
            <div class="historico-item-metrics">
              <div class="historico-metric">
                <div class="historico-metric-label">Total Bruto</div>
                <div class="historico-metric-value">${fmtMoeda(h.totalBruto || 0)}</div>
              </div>
              <div class="historico-metric">
                <div class="historico-metric-label">Vendas</div>
                <div class="historico-metric-value" style="color:var(--accent)">${h.numVendas || 0}</div>
              </div>
            </div>
            <i class="fa-solid fa-chevron-down historico-item-chevron"></i>
          </div>

          <div class="historico-item-body">

            <!-- KPIs -->
            <div class="hist-kpi-row">
              <div class="hist-kpi">
                <div class="hist-kpi-label">Total Bruto</div>
                <div class="hist-kpi-value green">${fmtMoeda(h.totalBruto || 0)}</div>
              </div>
              <div class="hist-kpi">
                <div class="hist-kpi-label">Total Líquido</div>
                <div class="hist-kpi-value blue">${fmtMoeda(h.totalLiquido || 0)}</div>
              </div>
              <div class="hist-kpi">
                <div class="hist-kpi-label">Taxa (10%)</div>
                <div class="hist-kpi-value orange">${fmtMoeda(h.valorTaxa || 0)}</div>
              </div>
              <div class="hist-kpi">
                <div class="hist-kpi-label">Itens Vendidos</div>
                <div class="hist-kpi-value">${h.totalQtdVendida || 0}</div>
              </div>
              <div class="hist-kpi">
                <div class="hist-kpi-label">Nº de Vendas</div>
                <div class="hist-kpi-value">${h.numVendas || 0}</div>
              </div>
            </div>

            <!-- Vendedores -->
            ${vendStats.length ? `
            <div class="hist-table-title"><i class="fa-solid fa-users"></i> Desempenho por Vendedor</div>
            <table class="hist-table">
              <thead><tr><th>Vendedor</th><th>Nº Vendas</th><th>Total</th></tr></thead>
              <tbody>
                ${vendStats.map(v => `
                  <tr>
                    <td>${sanitize(v.nome)}</td>
                    <td><span class="badge badge-blue">${v.numVendas}</span></td>
                    <td style="color:var(--green);font-weight:700">${fmtMoeda(v.totalVendido)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>` : ''}

            <!-- Produtos vendidos -->
            ${prods.length ? `
            <div class="hist-table-title"><i class="fa-solid fa-receipt"></i> Produtos Vendidos</div>
            <table class="hist-table">
              <thead><tr><th>Produto</th><th>Vendedor</th><th>Qtd</th><th>Total</th></tr></thead>
              <tbody>
                ${prods.map(p => `
                  <tr>
                    <td>${sanitize(p.nome)}</td>
                    <td>${sanitize(p.vendedorNome)}</td>
                    <td><span class="badge badge-green">${p.qtd}</span></td>
                    <td style="color:var(--green);font-weight:600">${fmtMoeda(p.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>` : '<p style="font-size:0.8rem;color:var(--text-faint);margin-bottom:12px">Nenhum produto vendido.</p>'}

            <!-- Estoque restante -->
            ${estoqueRows.length ? `
            <div class="hist-table-title"><i class="fa-solid fa-warehouse"></i> Estoque no Fechamento</div>
            <table class="hist-table">
              <thead><tr><th>Produto</th><th>Vendedor</th><th>Inicial</th><th>Vendido</th><th>Restante</th></tr></thead>
              <tbody>
                ${estoqueRows.map(e => `
                  <tr>
                    <td>${sanitize(e.nome)}</td>
                    <td>${sanitize(e.vendedorNome)}</td>
                    <td>${e.qtdInicial}</td>
                    <td><span class="badge ${e.qtdVendida > 0 ? 'badge-green' : 'badge-yellow'}">${e.qtdVendida}</span></td>
                    <td><span class="badge ${e.qtdRestante > 5 ? 'badge-green' : e.qtdRestante > 0 ? 'badge-yellow' : 'badge-red'}">${e.qtdRestante}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>` : ''}

            <!-- Ações -->
            <div class="historico-item-actions">
              <button class="btn-secondary" style="font-size:0.78rem;padding:6px 12px"
                onclick="ModCaixa.exportarItemCSV('${h.id}')">
                <i class="fa-solid fa-file-csv"></i> Exportar CSV
              </button>
              <button class="btn-icon btn-del" title="Excluir relatório"
                onclick="ModCaixa.excluirItem('${h.id}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
        }).join('');
    };

    /* ---------- TOGGLE ITEM EXPANDIDO ---------- */
    const toggleHistItem = (id) => {
        const el = document.getElementById(`hist-item-${id}`);
        if (!el) return;
        el.classList.toggle('expanded');
    };

    /* ---------- EXCLUIR ITEM DO HISTÓRICO ---------- */
    const excluirItem = (id) => {
        if (!confirm('Excluir este relatório do histórico?')) return;
        const list = getHistorico().filter(h => h.id !== id);
        saveHistorico(list);
        _renderHistorico(document.getElementById('historico-search-input')?.value || '');
        _atualizarBadgeHistorico();
        if (typeof UI !== 'undefined') UI.toast('Relatório excluído.', 'info');
    };

    /* ---------- EXPORTAR CSV DO ITEM ---------- */
    const exportarItemCSV = (id) => {
        const h = getHistorico().find(x => x.id === id);
        if (!h) return;

        const rows = [
            ['Relatório PDV Pro', fmtDateKey(h.dataCriacao)],
            ['Total Bruto', h.totalBruto?.toFixed(2).replace('.', ',')],
            ['Taxa (10%)', h.valorTaxa?.toFixed(2).replace('.', ',')],
            ['Total Líquido', h.totalLiquido?.toFixed(2).replace('.', ',')],
            ['Nº Vendas', h.numVendas],
            [''],
            ['PRODUTOS VENDIDOS'],
            ['Produto', 'Vendedor', 'Qtd Vendida', 'Preço Unit.', 'Total'],
            ...(h.produtosVendidos || []).map(p => [
                p.nome, p.vendedorNome, p.qtd,
                p.preco?.toFixed(2).replace('.', ','),
                p.total?.toFixed(2).replace('.', ','),
            ]),
            [''],
            ['ESTOQUE NO FECHAMENTO'],
            ['Produto', 'Vendedor', 'Qtd Inicial', 'Qtd Vendida', 'Qtd Restante'],
            ...(h.estoqueSnap || []).map(e => [
                e.nome, e.vendedorNome, e.qtdInicial, e.qtdVendida, e.qtdRestante,
            ]),
        ];

        const csv = rows.map(r => r.map(c => `"${c ?? ''}"`).join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_${fmtDateKey(h.dataCriacao).replace(/\//g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        if (typeof UI !== 'undefined') UI.toast('CSV exportado!', 'success');
    };

    /* ---------- LIMPAR HISTÓRICO ---------- */
    const _limparHistorico = () => {
        if (!confirm('Apagar TODO o histórico de relatórios? Esta ação não pode ser desfeita.')) return;
        saveHistorico([]);
        _renderHistorico();
        _atualizarBadgeHistorico();
        if (typeof UI !== 'undefined') UI.toast('Histórico apagado.', 'info');
    };

    /* ---------- EVENTOS ---------- */
    const _bindEvents = () => {
        // Botão Abertura/Fechamento
        document.addEventListener('click', e => {
            if (e.target.closest('#btn-abertura-fechamento')) {
                _carregarConfigNoModal();
                if (typeof UI !== 'undefined') UI.openModal('modal-caixa');
            }

            if (e.target.closest('#btn-historico')) {
                _renderHistorico();
                _atualizarBadgeHistorico();
                if (typeof UI !== 'undefined') UI.openModal('modal-historico');
            }

            if (e.target.closest('#btn-salvar-caixa')) {
                _salvarConfig();
            }

            if (e.target.closest('#btn-encerrar-manual')) {
                if (!confirm('Encerrar o caixa agora? O relatório atual será salvo no histórico.')) return;
                if (typeof UI !== 'undefined') UI.closeModal('modal-caixa');
                encerrarCaixa(true);
            }

            if (e.target.closest('#btn-limpar-historico')) {
                _limparHistorico();
            }
        });

        // Checkbox padrão
        document.addEventListener('change', e => {
            if (e.target.id === 'caixa-usar-padrao') {
                _toggleInputsHorario(e.target.checked);
                _atualizarPreview();
            }
        });

        // Preview em tempo real
        document.addEventListener('input', e => {
            if (e.target.id === 'caixa-abertura' || e.target.id === 'caixa-fechamento') {
                _atualizarPreview();
            }
            if (e.target.id === 'historico-search-input') {
                _renderHistorico(e.target.value);
            }
        });
    };

    /* ---------- INIT ---------- */
    const init = () => {
        _injectHTML();
        _bindEvents();

        // Checa se já encerrou hoje
        if (getLastCheck() === hojeStr()) {
            _encerradoHoje = true;
        }

        _atualizarStatus();
        _atualizarBadgeHistorico();
        _iniciarMonitor();
    };

    /* ---------- API PÚBLICA ---------- */
    return {
        init,
        toggleHistItem,
        excluirItem,
        exportarItemCSV,
        encerrarCaixa,
        getCaixaStatus,
        getConfig,
    };

})();

/* =====================================================
  AUTO-INIT: Aguarda DOM pronto
  ===================================================== */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ModCaixa.init());
} else {
    // DOM já pronto (script carregado depois do DOMContentLoaded)
    ModCaixa.init();
}