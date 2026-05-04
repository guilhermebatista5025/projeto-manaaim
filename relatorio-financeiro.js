/**
 * PDV Pro — Módulo Relatório Financeiro
 * Modal em 2 etapas · Cálculos · Render · Export PDF
 *
 * Como usar:
 *   1. <link rel="stylesheet" href="relatorio-financeiro.css"> no <head>
 *   2. <script src="relatorio-financeiro.js"></script> após script.js e caixa.js
 *
 * Dependências: DB, UI (de script.js)
 */

'use strict';

const ModRelatorioFinanceiro = (() => {

  /* ─────────────────────────────────────────────────
     CONSTANTES
  ───────────────────────────────────────────────── */
  const TAXA = 0.10;

  /* ─────────────────────────────────────────────────
     ESTADO
  ───────────────────────────────────────────────── */
  let _estado  = null;
  let _etapaAtual = 1; // 1 = Fichas, 2 = Cantina/Caixa

  /* ─────────────────────────────────────────────────
     FORMATADORES
  ───────────────────────────────────────────────── */
  const fmt = v =>
    `R$ ${Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

  const sanitize = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const hoje = () =>
    new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

  const agora = () =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  /* ─────────────────────────────────────────────────
     DADOS DO DB
  ───────────────────────────────────────────────── */
  const _getFornecedores = () => {
    const vendedores = DB.getVendedores();
    const vendas     = DB.getVendas();
    return vendedores.map(v => {
      const vv    = vendas.filter(x => x.vendedorId === v.id);
      const bruto = vv.reduce((a, x) => a + x.total, 0);
      return {
        nome:      v.nome,
        bruto,
        desconto:  bruto * TAXA,
        liquido:   bruto * (1 - TAXA),
        numVendas: vv.length,
      };
    });
  };

  /* ─────────────────────────────────────────────────
     CÁLCULOS CENTRAIS
  ───────────────────────────────────────────────── */
  const _calcular = () => {
    const fornecedores  = _getFornecedores();
    const totalBruto    = fornecedores.reduce((a, f) => a + f.bruto, 0);
    const totalDesconto = totalBruto * TAXA;
    const totalLiquido  = totalBruto * (1 - TAXA);

    const {
      fichasCantina, fichasFornecedores, brutoCantina,
      caixaInicial, valorPix, caixaFinal,
    } = _estado;

    const totalFichas     = fichasCantina + fichasFornecedores;
    const diferencaFichas = totalBruto - totalFichas;

    const caixaTotalFinal = caixaFinal + valorPix;
    const movimento       = caixaFinal - caixaInicial;

    const resultadoCantina      = fichasCantina - brutoCantina;
    const resultadoFornecedores = fichasFornecedores - totalBruto;

    return {
      fornecedores,
      totalBruto, totalDesconto, totalLiquido,
      totalFichas, diferencaFichas,
      caixaInicial, caixaFinal, valorPix, caixaTotalFinal, movimento,
      fichasCantina, fichasFornecedores, brutoCantina,
      resultadoCantina, resultadoFornecedores,
    };
  };

  /* ─────────────────────────────────────────────────
     HELPERS DE STATUS
  ───────────────────────────────────────────────── */
  const _statusClass = v => v > 0 ? 'rf-positivo' : v < 0 ? 'rf-negativo' : 'rf-neutro';
  const _statusLabel = v => v > 0 ? '▲ Lucro' : v < 0 ? '▼ Prejuízo' : '● Equilíbrio';
  const _statusColor = v => v > 0 ? '#0e9f6e' : v < 0 ? '#e02424' : '#6b7494';

  /* ─────────────────────────────────────────────────
     CAMPO CALCULADO ETAPA 2
  ───────────────────────────────────────────────── */
  const _syncCalculado = () => {
    const caixaFinal = parseFloat(document.getElementById('rf-caixa-final')?.value) || 0;
    const valorPix   = parseFloat(document.getElementById('rf-valor-pix')?.value)   || 0;
    const el = document.getElementById('rf-caixa-total');
    if (el) el.value = fmt(caixaFinal + valorPix);
  };

  /* ─────────────────────────────────────────────────
     STEPPER UI — ATUALIZAR INDICADOR DE ETAPA
  ───────────────────────────────────────────────── */
  const _atualizarStepper = (etapa) => {
    _etapaAtual = etapa;

    // Atualiza visual dos steps
    const steps = document.querySelectorAll('#rf-stepper .rf-step');
    steps.forEach((s, i) => {
      s.classList.remove('active', 'done');
      if (i + 1 < etapa) s.classList.add('done');
      else if (i + 1 === etapa) s.classList.add('active');
    });

    // Mostra/esconde painel de etapa
    const painel1 = document.getElementById('rf-painel-1');
    const painel2 = document.getElementById('rf-painel-2');
    if (painel1 && painel2) {
      painel1.style.display = etapa === 1 ? 'block' : 'none';
      painel2.style.display = etapa === 2 ? 'block' : 'none';
    }

    // Atualiza footer
    const footerEtapa1 = document.getElementById('rf-footer-etapa1');
    const footerEtapa2 = document.getElementById('rf-footer-etapa2');
    if (footerEtapa1 && footerEtapa2) {
      footerEtapa1.style.display = etapa === 1 ? 'flex' : 'none';
      footerEtapa2.style.display = etapa === 2 ? 'flex' : 'none';
    }

    // Atualiza título do header
    const titulo = document.getElementById('rf-modal-titulo');
    if (titulo) {
      titulo.textContent = etapa === 1 ? 'Fichas do Evento' : 'Cantina — Caixa';
    }

    // Scroll do body para o topo ao trocar etapa
    const body = document.querySelector('#modal-rf .rf-modal-body');
    if (body) body.scrollTop = 0;
  };

  /* ─────────────────────────────────────────────────
     VALIDAR ETAPA 1 (Fichas)
  ───────────────────────────────────────────────── */
  const _validarEtapa1 = () => {
    const ids = ['rf-fichas-cantina', 'rf-fichas-fornecedores'];
    let valido = true;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const val = el.value.trim();
      if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) < 0) {
        el.classList.add('rf-invalid');
        if (valido) { el.focus(); valido = false; }
      } else {
        el.classList.remove('rf-invalid');
      }
    }
    if (!valido) UI.toast('Preencha todos os campos de fichas com valores válidos (≥ 0).', 'error');
    return valido;
  };

  /* ─────────────────────────────────────────────────
     VALIDAR ETAPA 2 (Cantina/Caixa)
  ───────────────────────────────────────────────── */
  const _validarEtapa2 = () => {
    const ids = [
      'rf-bruto-cantina',
      'rf-caixa-inicial',
      'rf-valor-pix',
      'rf-caixa-final',
    ];
    let valido = true;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const val = el.value.trim();
      if (val === '' || isNaN(parseFloat(val)) || parseFloat(val) < 0) {
        el.classList.add('rf-invalid');
        if (valido) { el.focus(); valido = false; }
      } else {
        el.classList.remove('rf-invalid');
      }
    }
    if (!valido) UI.toast('Preencha todos os campos com valores válidos (≥ 0).', 'error');
    return valido;
  };

  /* ─────────────────────────────────────────────────
     AVANÇAR PARA ETAPA 2
  ───────────────────────────────────────────────── */
  const _avancarEtapa2 = () => {
    if (!_validarEtapa1()) return;
    _atualizarStepper(2);
  };

  /* ─────────────────────────────────────────────────
     VOLTAR PARA ETAPA 1
  ───────────────────────────────────────────────── */
  const _voltarEtapa1 = () => {
    _atualizarStepper(1);
  };

  /* ─────────────────────────────────────────────────
     CONFIRMAR (ETAPA 2) → GERAR RELATÓRIO
  ───────────────────────────────────────────────── */
  const _confirmar = () => {
    if (!_validarEtapa2()) return;

    _estado = {
      fichasCantina:      parseFloat(document.getElementById('rf-fichas-cantina').value),
      fichasFornecedores: parseFloat(document.getElementById('rf-fichas-fornecedores').value),
      brutoCantina:       parseFloat(document.getElementById('rf-bruto-cantina').value),
      caixaInicial:       parseFloat(document.getElementById('rf-caixa-inicial').value),
      valorPix:           parseFloat(document.getElementById('rf-valor-pix').value),
      caixaFinal:         parseFloat(document.getElementById('rf-caixa-final').value),
    };

    UI.closeModal('modal-rf');
    _renderRelatorio();
    UI.toast('Relatório gerado com sucesso!', 'success');
  };

  /* ─────────────────────────────────────────────────
     RENDER RELATÓRIO NO DOM
  ───────────────────────────────────────────────── */
  const _renderRelatorio = () => {
    const d = _calcular();
    const container = document.getElementById('rf-resultado');
    if (!container) return;

    const difClass = v => Math.abs(v) < 0.01 ? 'rf-neutro' : v > 0 ? 'rf-negativo' : 'rf-positivo';

    container.style.display = 'block';
    container.innerHTML = `

      <div class="rf-header">
        <div class="rf-header-left">
          <div class="rf-header-icon">
            <i class="fa-solid fa-file-invoice-dollar"></i>
          </div>
          <div>
            <h2 class="rf-titulo">Relatório Financeiro do Evento</h2>
            <p class="rf-subtitulo">${hoje()} — gerado às ${agora()}</p>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn-secondary" id="btn-rf-reabrir">
            <i class="fa-solid fa-pen-to-square"></i> Editar Dados
          </button>
          <button class="btn-primary" id="btn-rf-pdf">
            <i class="fa-solid fa-file-pdf"></i> Exportar PDF
          </button>
        </div>
      </div>

      <div class="rf-secao">
        <div class="rf-secao-header">
          <i class="fa-solid fa-chart-simple"></i> Resumo Geral
        </div>
        <div class="rf-kpi-grid">
          <div class="rf-kpi">
            <span class="rf-kpi-label">Total Bruto</span>
            <span class="rf-kpi-value" style="color:var(--accent)">${fmt(d.totalBruto)}</span>
          </div>
          <div class="rf-kpi">
            <span class="rf-kpi-label">Desconto (10%)</span>
            <span class="rf-kpi-value" style="color:var(--orange)">${fmt(d.totalDesconto)}</span>
          </div>
          <div class="rf-kpi">
            <span class="rf-kpi-label">Total Líquido</span>
            <span class="rf-kpi-value" style="color:var(--green)">${fmt(d.totalLiquido)}</span>
          </div>
        </div>
      </div>

      <div class="rf-secao">
        <div class="rf-secao-header">
          <i class="fa-solid fa-users"></i> Fornecedores
          <span style="margin-left:auto;font-size:0.75rem;font-weight:400;color:var(--text-muted);font-family:var(--font-body)">
            ${d.fornecedores.length} representante(s) — taxa de 10% aplicada
          </span>
        </div>
        <div class="rf-table-wrap">
          <table class="rf-table">
            <thead>
              <tr>
                <th>Representante</th>
                <th>Bruto</th>
                <th>Desconto (10%)</th>
                <th>Líquido</th>
                <th>Nº Vendas</th>
              </tr>
            </thead>
            <tbody>
              ${d.fornecedores.length
                ? d.fornecedores.map(f => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:9px">
                          <div style="width:30px;height:30px;border-radius:8px;background:var(--accent-glow);color:var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-weight:800;font-size:0.78rem;flex-shrink:0">
                            ${sanitize(f.nome.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}
                          </div>
                          <span style="font-weight:600">${sanitize(f.nome)}</span>
                        </div>
                      </td>
                      <td style="color:var(--accent);font-weight:700">${fmt(f.bruto)}</td>
                      <td style="color:var(--orange)">${fmt(f.desconto)}</td>
                      <td style="color:var(--green);font-weight:700">${fmt(f.liquido)}</td>
                      <td><span class="badge badge-blue">${f.numVendas}</span></td>
                    </tr>
                  `).join('')
                : `<tr><td colspan="5" class="rf-table-empty">
                    <i class="fa-solid fa-box-open" style="font-size:1.2rem;margin-bottom:6px;display:block"></i>
                    Nenhuma venda registrada no sistema
                   </td></tr>`
              }
            </tbody>
            ${d.fornecedores.filter(f => f.bruto > 0).length > 1 ? `
            <tfoot>
              <tr>
                <td><strong>Total Geral</strong></td>
                <td style="color:var(--accent);font-weight:700">${fmt(d.totalBruto)}</td>
                <td style="color:var(--orange)">${fmt(d.totalDesconto)}</td>
                <td style="color:var(--green);font-weight:700">${fmt(d.totalLiquido)}</td>
                <td></td>
              </tr>
            </tfoot>` : ''}
          </table>
        </div>
      </div>

      <div class="rf-secao">
        <div class="rf-secao-header">
          <i class="fa-solid fa-ticket"></i> Fichas
        </div>
        <div class="rf-info-grid">
          <div class="rf-info-item">
            <span class="rf-info-label"><i class="fa-solid fa-utensils" style="color:var(--accent);margin-right:4px"></i> Fichas Cantina</span>
            <span class="rf-info-value">${fmt(d.fichasCantina)}</span>
          </div>
          <div class="rf-info-item">
            <span class="rf-info-label"><i class="fa-solid fa-handshake" style="color:var(--accent);margin-right:4px"></i> Fichas Fornecedores</span>
            <span class="rf-info-value">${fmt(d.fichasFornecedores)}</span>
          </div>
          <div class="rf-info-item rf-info-destaque">
            <span class="rf-info-label">Total Fichas</span>
            <span class="rf-info-value" style="color:var(--accent)">${fmt(d.totalFichas)}</span>
          </div>
          <div class="rf-info-item ${difClass(d.diferencaFichas)}">
            <span class="rf-info-label">Diferença (Bruto − Total Fichas)</span>
            <span class="rf-info-value">${fmt(d.diferencaFichas)}</span>
          </div>
        </div>
      </div>

      <div class="rf-secao">
        <div class="rf-secao-header">
          <i class="fa-solid fa-cash-register"></i> Cantina — Caixa
        </div>
        <div class="rf-info-grid">
          <div class="rf-info-item">
            <span class="rf-info-label"><i class="fa-solid fa-vault" style="color:var(--text-faint);margin-right:4px"></i> Caixa Inicial</span>
            <span class="rf-info-value">${fmt(d.caixaInicial)}</span>
          </div>
          <div class="rf-info-item">
            <span class="rf-info-label"><i class="fa-solid fa-money-bill-wave" style="color:var(--text-faint);margin-right:4px"></i> Caixa Final (dinheiro)</span>
            <span class="rf-info-value">${fmt(d.caixaFinal)}</span>
          </div>
          <div class="rf-info-item">
            <span class="rf-info-label"><i class="fa-brands fa-pix" style="color:var(--accent);margin-right:4px"></i> Valor Pix</span>
            <span class="rf-info-value" style="color:var(--accent)">${fmt(d.valorPix)}</span>
          </div>
          <div class="rf-info-item rf-info-destaque">
            <span class="rf-info-label">Caixa Final + Pix</span>
            <span class="rf-info-value" style="color:var(--accent)">${fmt(d.caixaTotalFinal)}</span>
          </div>
          <div class="rf-info-item ${_statusClass(d.movimento)}">
            <span class="rf-info-label">Movimento (Final − Inicial)</span>
            <span class="rf-info-value">${fmt(d.movimento)}</span>
          </div>
        </div>
      </div>

      <div class="rf-secao rf-secao-resultado">
        <div class="rf-secao-header">
          <i class="fa-solid fa-chart-line"></i> Resultado Financeiro
        </div>
        <div class="rf-resultado-grid">

          <div class="rf-resultado-card ${_statusClass(d.resultadoCantina)}">
            <div class="rf-resultado-icon">
              <i class="fa-solid fa-utensils"></i>
            </div>
            <div class="rf-resultado-info">
              <span class="rf-resultado-label">Cantina</span>
              <span class="rf-resultado-valor">${fmt(d.resultadoCantina)}</span>
              <span class="rf-resultado-calc">Fichas Cantina (${fmt(d.fichasCantina)}) − Bruto Cantina (${fmt(d.brutoCantina)})</span>
            </div>
            <div class="rf-resultado-status">${_statusLabel(d.resultadoCantina)}</div>
          </div>

          <div class="rf-resultado-card ${_statusClass(d.resultadoFornecedores)}">
            <div class="rf-resultado-icon">
              <i class="fa-solid fa-handshake"></i>
            </div>
            <div class="rf-resultado-info">
              <span class="rf-resultado-label">Fornecedores</span>
              <span class="rf-resultado-valor">${fmt(d.resultadoFornecedores)}</span>
              <span class="rf-resultado-calc">Fichas Fornecedores (${fmt(d.fichasFornecedores)}) − Total Bruto (${fmt(d.totalBruto)})</span>
            </div>
            <div class="rf-resultado-status">${_statusLabel(d.resultadoFornecedores)}</div>
          </div>

        </div>
      </div>

    `;

    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ─────────────────────────────────────────────────
     EXPORTAR PDF
  ───────────────────────────────────────────────── */
  const _exportarPDF = () => {
    if (!_estado) { UI.toast('Gere o relatório antes de exportar.', 'error'); return; }

    const d = _calcular();
    const difColor = v => Math.abs(v) < 0.01 ? '#6b7494' : v > 0 ? '#e02424' : '#0e9f6e';

    const fornRows = d.fornecedores.length
      ? d.fornecedores.map(f => `
          <tr>
            <td>${sanitize(f.nome)}</td>
            <td style="color:#1a56db;font-weight:700">${fmt(f.bruto)}</td>
            <td style="color:#f7894f">${fmt(f.desconto)}</td>
            <td style="color:#0e9f6e;font-weight:700">${fmt(f.liquido)}</td>
            <td style="text-align:center">${f.numVendas}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" style="text-align:center;color:#b8bdd4;padding:16px">Nenhuma venda registrada</td></tr>`;

    const fornTfoot = d.fornecedores.filter(f => f.bruto > 0).length > 1 ? `
      <tfoot>
        <tr>
          <td><strong>Total Geral</strong></td>
          <td style="color:#1a56db;font-weight:700">${fmt(d.totalBruto)}</td>
          <td style="color:#f7894f">${fmt(d.totalDesconto)}</td>
          <td style="color:#0e9f6e;font-weight:700">${fmt(d.totalLiquido)}</td>
          <td></td>
        </tr>
      </tfoot>` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório Financeiro — ${new Date().toLocaleDateString('pt-BR')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1f36; padding: 36px 40px; line-height: 1.5; }
    .header { border-bottom: 2.5px solid #1a56db; padding-bottom: 14px; margin-bottom: 24px; }
    .header h1 { font-size: 20px; font-weight: 700; color: #1a1f36; }
    .header .sub { font-size: 11px; color: #6b7494; margin-top: 3px; }
    h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #1a56db; margin: 22px 0 8px; border-bottom: 1px solid #dce1ec; padding-bottom: 5px; }
    .kpi-row { display: flex; gap: 12px; margin-bottom: 4px; }
    .kpi { flex: 1; border: 1px solid #dce1ec; background: #f0f3f9; border-radius: 6px; padding: 10px 14px; }
    .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7494; font-weight: 600; display: block; margin-bottom: 4px; }
    .kpi-value { font-size: 15px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    thead th { background: #f0f3f9; padding: 7px 10px; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7494; border-bottom: 1px solid #dce1ec; font-weight: 700; }
    tbody td { padding: 8px 10px; border-bottom: 1px solid #eaeef6; vertical-align: middle; }
    tbody tr:last-child td { border-bottom: none; }
    tfoot td { padding: 8px 10px; background: #f0f3f9; border-top: 1px solid #dce1ec; font-weight: 700; }
    .info-table td:first-child { color: #6b7494; font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
    .info-table td:last-child { font-weight: 700; text-align: right; }
    .resultado-table .status-col { font-weight: 700; text-align: center; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eaeef6; font-size: 10px; color: #b8bdd4; text-align: center; }
    @media print { @page { margin: 14mm 18mm; size: A4; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Relatório Financeiro do Evento</h1>
    <p class="sub">${hoje()} — gerado às ${agora()}</p>
  </div>
  <h2>Resumo Geral</h2>
  <div class="kpi-row">
    <div class="kpi"><span class="kpi-label">Total Bruto</span><span class="kpi-value" style="color:#1a56db">${fmt(d.totalBruto)}</span></div>
    <div class="kpi"><span class="kpi-label">Desconto (10%)</span><span class="kpi-value" style="color:#f7894f">${fmt(d.totalDesconto)}</span></div>
    <div class="kpi"><span class="kpi-label">Total Líquido</span><span class="kpi-value" style="color:#0e9f6e">${fmt(d.totalLiquido)}</span></div>
  </div>
  <h2>Fornecedores</h2>
  <table>
    <thead><tr><th>Representante</th><th>Bruto</th><th>Desconto (10%)</th><th>Líquido</th><th style="text-align:center">Vendas</th></tr></thead>
    <tbody>${fornRows}</tbody>
    ${fornTfoot}
  </table>
  <h2>Fichas</h2>
  <table class="info-table">
    <thead><tr><th>Item</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>
      <tr><td>Fichas Cantina</td><td style="text-align:right">${fmt(d.fichasCantina)}</td></tr>
      <tr><td>Fichas Fornecedores</td><td style="text-align:right">${fmt(d.fichasFornecedores)}</td></tr>
      <tr><td><strong>Total Fichas</strong></td><td style="text-align:right;color:#1a56db;font-weight:700">${fmt(d.totalFichas)}</td></tr>
      <tr><td>Diferença (Bruto − Total Fichas)</td><td style="text-align:right;font-weight:700;color:${difColor(d.diferencaFichas)}">${fmt(d.diferencaFichas)}</td></tr>
    </tbody>
  </table>
  <h2>Cantina — Caixa</h2>
  <table class="info-table">
    <thead><tr><th>Item</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>
      <tr><td>Caixa Inicial</td><td style="text-align:right">${fmt(d.caixaInicial)}</td></tr>
      <tr><td>Caixa Final (dinheiro físico)</td><td style="text-align:right">${fmt(d.caixaFinal)}</td></tr>
      <tr><td>Valor Pix</td><td style="text-align:right;color:#1a56db">${fmt(d.valorPix)}</td></tr>
      <tr><td><strong>Caixa Final + Pix</strong></td><td style="text-align:right;color:#1a56db;font-weight:700">${fmt(d.caixaTotalFinal)}</td></tr>
      <tr><td>Movimento (Final − Inicial)</td><td style="text-align:right;font-weight:700;color:${_statusColor(d.movimento)}">${fmt(d.movimento)}</td></tr>
    </tbody>
  </table>
  <h2>Resultado Financeiro</h2>
  <table class="resultado-table">
    <thead><tr><th>Tipo</th><th>Cálculo</th><th style="text-align:right">Valor</th><th class="status-col">Status</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>Cantina</strong></td>
        <td style="color:#6b7494;font-size:10.5px">Fichas Cantina − Bruto Cantina</td>
        <td style="text-align:right;font-weight:700;color:${_statusColor(d.resultadoCantina)}">${fmt(d.resultadoCantina)}</td>
        <td class="status-col" style="color:${_statusColor(d.resultadoCantina)}">${_statusLabel(d.resultadoCantina)}</td>
      </tr>
      <tr>
        <td><strong>Fornecedores</strong></td>
        <td style="color:#6b7494;font-size:10.5px">Fichas Fornecedores − Total Bruto</td>
        <td style="text-align:right;font-weight:700;color:${_statusColor(d.resultadoFornecedores)}">${fmt(d.resultadoFornecedores)}</td>
        <td class="status-col" style="color:${_statusColor(d.resultadoFornecedores)}">${_statusLabel(d.resultadoFornecedores)}</td>
      </tr>
    </tbody>
  </table>
  <p class="footer">Gerado pelo PDV Pro &bull; ${hoje()} &bull; ${agora()}</p>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { UI.toast('Popups bloqueados. Habilite popups para exportar o PDF.', 'error'); return; }
    win.document.write(html);
    win.document.close();
  };

  /* ─────────────────────────────────────────────────
     INJETAR HTML — STEPPER DE 2 ETAPAS
  ───────────────────────────────────────────────── */
  const _injectHTML = () => {

    /* 1. BOTÃO na filter-actions */
    const filterActions = document.querySelector('.filter-actions');
    if (filterActions) {
      const sep = document.createElement('div');
      sep.className = 'rf-divider';

      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.id = 'btn-rf-abrir';
      btn.innerHTML = '<i class="fa-solid fa-file-invoice-dollar"></i> Relatório Financeiro';

      filterActions.prepend(sep);
      filterActions.prepend(btn);
    }

    /* 2. MODAL COM STEPPER */
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-rf';
    modal.innerHTML = `
      <div class="modal rf-modal">

        <!-- Drag indicator (mobile) -->
        <div class="rf-drag-handle"></div>

        <!-- Header -->
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
            <i class="fa-solid fa-file-invoice-dollar" style="color:var(--accent);font-size:1rem;flex-shrink:0"></i>
            <h3 id="rf-modal-titulo" style="font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              Fichas do Evento
            </h3>
          </div>
          <button class="btn-icon modal-close" data-modal="modal-rf">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Stepper indicator -->
        <div id="rf-stepper" class="rf-stepper">
          <div class="rf-step active" data-step="1">
            <div class="rf-step-circle">
              <i class="fa-solid fa-ticket"></i>
            </div>
            <span class="rf-step-label">Fichas</span>
          </div>
          <div class="rf-step-line"></div>
          <div class="rf-step" data-step="2">
            <div class="rf-step-circle">
              <i class="fa-solid fa-cash-register"></i>
            </div>
            <span class="rf-step-label">Cantina</span>
          </div>
        </div>

        <!-- Body com scroll -->
        <div class="modal-body rf-modal-body">

          <!-- ── ETAPA 1: FICHAS ── -->
          <div id="rf-painel-1">
            <div class="rf-etapa-intro">
              <div class="rf-etapa-icon" style="background:rgba(26,86,219,.1);color:var(--accent)">
                <i class="fa-solid fa-ticket"></i>
              </div>
              <div>
                <strong>Distribuição de Fichas</strong>
                <span>Informe os valores arrecadados em fichas por origem</span>
              </div>
            </div>

            <div class="rf-field-block">
              <label class="rf-field-label" for="rf-fichas-cantina">
                <i class="fa-solid fa-utensils"></i> Fichas Cantina (R$) *
              </label>
              <input type="number" id="rf-fichas-cantina" class="input-styled rf-input-lg"
                placeholder="0,00" min="0" step="0.01" inputmode="decimal">
              <span class="rf-field-hint">Total em fichas destinadas à cantina</span>
            </div>

            <div class="rf-field-block">
              <label class="rf-field-label" for="rf-fichas-fornecedores">
                <i class="fa-solid fa-handshake"></i> Fichas Fornecedores (R$) *
              </label>
              <input type="number" id="rf-fichas-fornecedores" class="input-styled rf-input-lg"
                placeholder="0,00" min="0" step="0.01" inputmode="decimal">
              <span class="rf-field-hint">Total em fichas destinadas aos fornecedores</span>
            </div>

            <!-- Preview total fichas -->
            <div class="rf-preview-total" id="rf-preview-fichas">
              <span class="rf-preview-label">Total de fichas</span>
              <span class="rf-preview-value" id="rf-preview-fichas-valor">R$ 0,00</span>
            </div>

            <p class="rf-nota">* Campos obrigatórios</p>
          </div>

          <!-- ── ETAPA 2: CANTINA/CAIXA ── -->
          <div id="rf-painel-2" style="display:none">
            <div class="rf-etapa-intro">
              <div class="rf-etapa-icon" style="background:rgba(14,159,110,.1);color:var(--green)">
                <i class="fa-solid fa-cash-register"></i>
              </div>
              <div>
                <strong>Cantina — Movimento de Caixa</strong>
                <span>Informe os valores financeiros do caixa físico</span>
              </div>
            </div>

            <div class="rf-field-block">
              <label class="rf-field-label" for="rf-bruto-cantina">
                <i class="fa-solid fa-store"></i> Vendas da Cantina — Bruto (R$) *
              </label>
              <input type="number" id="rf-bruto-cantina" class="input-styled rf-input-lg"
                placeholder="0,00" min="0" step="0.01" inputmode="decimal">
            </div>

            <div class="rf-field-block">
              <label class="rf-field-label" for="rf-caixa-inicial">
                <i class="fa-solid fa-vault"></i> Caixa Inicial (R$) *
              </label>
              <input type="number" id="rf-caixa-inicial" class="input-styled rf-input-lg"
                placeholder="0,00" min="0" step="0.01" inputmode="decimal">
            </div>

            <div class="rf-field-block">
              <label class="rf-field-label" for="rf-valor-pix">
                <i class="fa-brands fa-pix"></i> Valor Pix (R$) *
              </label>
              <input type="number" id="rf-valor-pix" class="input-styled rf-input-lg"
                placeholder="0,00" min="0" step="0.01" inputmode="decimal">
            </div>

            <div class="rf-field-block">
              <label class="rf-field-label" for="rf-caixa-final">
                <i class="fa-solid fa-money-bill-wave"></i> Caixa Final — dinheiro físico (R$) *
              </label>
              <input type="number" id="rf-caixa-final" class="input-styled rf-input-lg"
                placeholder="0,00" min="0" step="0.01" inputmode="decimal">
            </div>

            <!-- Campo calculado -->
            <div class="rf-preview-total">
              <span class="rf-preview-label">
                <i class="fa-solid fa-equals" style="font-size:0.7rem;margin-right:4px"></i>
                Caixa Final + Pix
              </span>
              <span class="rf-preview-value" id="rf-preview-total-valor">R$ 0,00</span>
            </div>

            <p class="rf-nota">* Campos obrigatórios — Fornecedores carregados automaticamente do sistema</p>
          </div>

        </div>

        <!-- Footer Etapa 1 -->
        <div class="modal-footer rf-modal-footer" id="rf-footer-etapa1">
          <span class="rf-footer-info">
            <i class="fa-solid fa-database" style="margin-right:4px"></i>
            ${DB.getVendedores().length} fornecedor(es)
          </span>
          <div style="display:flex;gap:10px">
            <button class="btn-secondary modal-close" data-modal="modal-rf">Cancelar</button>
            <button class="btn-primary" id="btn-rf-avancar">
              Continuar <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Footer Etapa 2 -->
        <div class="modal-footer rf-modal-footer" id="rf-footer-etapa2" style="display:none">
          <button class="btn-secondary" id="btn-rf-voltar">
            <i class="fa-solid fa-arrow-left"></i> Voltar
          </button>
          <button class="btn-primary" id="btn-rf-confirmar">
            <i class="fa-solid fa-chart-bar"></i> Gerar Relatório
          </button>
        </div>

      </div>
    `;
    document.body.appendChild(modal);

    /* 3. CONTAINER de resultado */
    const section = document.getElementById('section-relatorios');
    if (section) {
      const div = document.createElement('div');
      div.id = 'rf-resultado';
      div.style.display = 'none';
      div.style.marginTop = '24px';
      section.appendChild(div);
    }
  };

  /* ─────────────────────────────────────────────────
     PREVIEW EM TEMPO REAL
  ───────────────────────────────────────────────── */
  const _syncPreviewFichas = () => {
    const c = parseFloat(document.getElementById('rf-fichas-cantina')?.value) || 0;
    const f = parseFloat(document.getElementById('rf-fichas-fornecedores')?.value) || 0;
    const el = document.getElementById('rf-preview-fichas-valor');
    if (el) el.textContent = fmt(c + f);
  };

  const _syncPreviewTotal = () => {
    const caixaFinal = parseFloat(document.getElementById('rf-caixa-final')?.value) || 0;
    const valorPix   = parseFloat(document.getElementById('rf-valor-pix')?.value)   || 0;
    const el = document.getElementById('rf-preview-total-valor');
    if (el) el.textContent = fmt(caixaFinal + valorPix);
    _syncCalculado();
  };

  /* ─────────────────────────────────────────────────
     PREENCHER MODAL COM ESTADO ANTERIOR
  ───────────────────────────────────────────────── */
  const _preencherEstadoAnterior = () => {
    if (!_estado) return;
    const fill = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    fill('rf-fichas-cantina',      _estado.fichasCantina);
    fill('rf-fichas-fornecedores', _estado.fichasFornecedores);
    fill('rf-bruto-cantina',       _estado.brutoCantina);
    fill('rf-caixa-inicial',       _estado.caixaInicial);
    fill('rf-valor-pix',           _estado.valorPix);
    fill('rf-caixa-final',         _estado.caixaFinal);
    _syncPreviewFichas();
    _syncPreviewTotal();
  };

  /* ─────────────────────────────────────────────────
     EVENTOS
  ───────────────────────────────────────────────── */
  const _bindEvents = () => {
    document.addEventListener('click', e => {

      /* Abrir modal → sempre começa na etapa 1 */
      if (e.target.closest('#btn-rf-abrir')) {
        _atualizarStepper(1);
        const countEl = document.querySelector('#modal-rf .rf-footer-info');
        if (countEl) {
          countEl.innerHTML = `<i class="fa-solid fa-database" style="margin-right:4px"></i>
            ${DB.getVendedores().length} fornecedor(es)`;
        }
        UI.openModal('modal-rf');
        _syncPreviewFichas();
        _syncPreviewTotal();
      }

      /* Avançar etapa 1 → 2 */
      if (e.target.closest('#btn-rf-avancar')) _avancarEtapa2();

      /* Voltar etapa 2 → 1 */
      if (e.target.closest('#btn-rf-voltar')) _voltarEtapa1();

      /* Confirmar e gerar */
      if (e.target.closest('#btn-rf-confirmar')) _confirmar();

      /* Exportar PDF */
      if (e.target.closest('#btn-rf-pdf')) _exportarPDF();

      /* Reabrir modal para editar — começa na etapa 1 */
      if (e.target.closest('#btn-rf-reabrir')) {
        _atualizarStepper(1);
        _preencherEstadoAnterior();
        UI.openModal('modal-rf');
      }
    });

    /* Previews em tempo real */
    document.addEventListener('input', e => {
      const id = e.target.id;

      if (id === 'rf-fichas-cantina' || id === 'rf-fichas-fornecedores') {
        _syncPreviewFichas();
      }

      if (id === 'rf-caixa-final' || id === 'rf-valor-pix') {
        _syncPreviewTotal();
      }

      /* Remove borda de erro ao digitar */
      if (e.target.classList.contains('rf-invalid')) {
        const val = e.target.value.trim();
        if (val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) >= 0) {
          e.target.classList.remove('rf-invalid');
        }
      }
    });

    /* Enter avança etapa no painel 1 */
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && _etapaAtual === 1) {
        const painel1 = document.getElementById('rf-painel-1');
        if (painel1 && painel1.style.display !== 'none') {
          _avancarEtapa2();
        }
      }
    });
  };

  /* ─────────────────────────────────────────────────
     INJECT CSS DO STEPPER
  ───────────────────────────────────────────────── */
  const _injectStepperCSS = () => {
    const style = document.createElement('style');
    style.textContent = `
      /* ── Modal stepper: bottom sheet mobile ── */
      #modal-rf {
        align-items: flex-end !important;
        padding: 0 !important;
      }
      #modal-rf .modal.rf-modal {
        max-width: 560px;
        width: 100%;
        border-radius: 20px 20px 0 0;
        border-bottom: none;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        margin: 0 auto;
      }
      @media (min-width: 701px) {
        #modal-rf {
          align-items: center !important;
          padding: 20px !important;
        }
        #modal-rf .modal.rf-modal {
          border-radius: var(--radius) !important;
          border: 1px solid var(--border) !important;
          max-height: 85vh;
        }
        .rf-drag-handle { display: none !important; }
      }

      /* Drag handle */
      .rf-drag-handle {
        width: 36px; height: 4px;
        background: var(--border);
        border-radius: 2px;
        margin: 10px auto 0;
        flex-shrink: 0;
      }

      /* Header fixo */
      #modal-rf .modal-header { flex-shrink: 0; }

      /* Body com scroll */
      #modal-rf .rf-modal-body {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 0 18px 8px;
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      /* Footer fixo */
      .rf-modal-footer {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        padding-bottom: max(12px, env(safe-area-inset-bottom));
        border-top: 1px solid var(--border);
        background: var(--bg-card);
        gap: 10px;
      }

      /* ── Stepper ── */
      .rf-stepper {
        display: flex;
        align-items: center;
        padding: 14px 28px;
        border-bottom: 1px solid var(--border-soft);
        gap: 0;
        flex-shrink: 0;
      }
      .rf-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
      }
      .rf-step-circle {
        width: 36px; height: 36px;
        border-radius: 50%;
        background: var(--bg-card2);
        border: 2px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        font-size: 0.82rem;
        color: var(--text-faint);
        transition: all 0.25s ease;
      }
      .rf-step-label {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--text-faint);
        text-transform: uppercase;
        letter-spacing: 0.4px;
        transition: color 0.25s;
      }
      .rf-step.active .rf-step-circle {
        background: var(--accent-glow);
        border-color: var(--accent);
        color: var(--accent);
      }
      .rf-step.active .rf-step-label { color: var(--accent); }
      .rf-step.done .rf-step-circle {
        background: var(--green-bg);
        border-color: var(--green);
        color: var(--green);
      }
      .rf-step.done .rf-step-label { color: var(--green); }
      .rf-step-line {
        flex: 1;
        height: 2px;
        background: var(--border);
        margin: 0 10px;
        margin-bottom: 22px;
        border-radius: 1px;
        transition: background 0.3s;
      }
      .rf-step.done ~ .rf-step-line,
      .rf-step-line:has(+ .rf-step.active) {
        background: var(--green);
      }

      /* ── Etapa intro ── */
      .rf-etapa-intro {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 0 14px;
        border-bottom: 1px solid var(--border-soft);
        margin-bottom: 18px;
      }
      .rf-etapa-icon {
        width: 40px; height: 40px;
        border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1rem;
        flex-shrink: 0;
      }
      .rf-etapa-intro strong {
        display: block;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--text);
        font-family: var(--font-head);
      }
      .rf-etapa-intro span {
        font-size: 0.78rem;
        color: var(--text-muted);
        margin-top: 2px;
        display: block;
      }

      /* ── Campos ── */
      .rf-field-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
      }
      .rf-field-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.45px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .rf-field-label i { color: var(--accent); font-size: 0.72rem; }
      .rf-field-hint {
        font-size: 0.72rem;
        color: var(--text-faint);
        font-style: italic;
      }
      .rf-input-lg {
        font-size: 1.1rem !important;
        font-family: var(--font-head) !important;
        font-weight: 700 !important;
        padding: 11px 14px !important;
        letter-spacing: 0.5px;
      }

      /* ── Preview total ── */
      .rf-preview-total {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: var(--accent-glow);
        border: 1.5px solid rgba(26,86,219,0.15);
        border-radius: 10px;
        margin-bottom: 16px;
      }
      .rf-preview-label {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--accent);
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .rf-preview-value {
        font-family: var(--font-head);
        font-size: 1.15rem;
        font-weight: 800;
        color: var(--accent);
      }

      /* ── Nota ── */
      .rf-nota {
        font-size: 0.72rem;
        color: var(--text-faint);
        text-align: center;
        margin-bottom: 8px;
      }

      /* ── Footer info ── */
      .rf-footer-info {
        font-size: 0.75rem;
        color: var(--text-faint);
        display: flex;
        align-items: center;
      }

      /* ── Invalid ── */
      .rf-invalid {
        border-color: var(--red) !important;
        box-shadow: 0 0 0 3px var(--red-bg) !important;
      }
    `;
    document.head.appendChild(style);
  };

  /* ─────────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────────── */
  const init = () => {
    _injectStepperCSS();
    _injectHTML();
    _bindEvents();
  };

  return { init };

})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ModRelatorioFinanceiro.init());
} else {
  ModRelatorioFinanceiro.init();
}