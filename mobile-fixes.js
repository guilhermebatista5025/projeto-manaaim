/**
 * PDV Pro — Mobile Fixes JS
 * - Move info detalhada do caixa para o sidebar footer
 * - Garante scroll correto ao focar inputs no modal
 */

'use strict';

(function () {

    /* ── Aguarda ModCaixa estar disponível ── */
    const waitForModCaixa = (cb, tries = 0) => {
        if (typeof ModCaixa !== 'undefined') { cb(); return; }
        if (tries > 20) return;
        setTimeout(() => waitForModCaixa(cb, tries + 1), 200);
    };

    /* ── 1. INFO DO CAIXA NO SIDEBAR FOOTER ── */
    const injectCaixaInfoSidebar = () => {
        const footer = document.querySelector('.sidebar-footer');
        if (!footer || document.getElementById('sidebar-caixa-info')) return;

        const info = document.createElement('div');
        info.id = 'sidebar-caixa-info';
        info.className = 'caixa-status-info-sidebar';
        footer.insertBefore(info, footer.firstChild);

        const update = () => {
            if (typeof ModCaixa === 'undefined') return;
            const cfg = ModCaixa.getConfig();
            const status = ModCaixa.getCaixaStatus();

            const statusLabel = {
                aberto: '● Aberto',
                fechado: '● Encerrado',
                aguardando: '● Aguardando',
            };
            const statusColor = {
                aberto: 'var(--green)',
                fechado: 'var(--red)',
                aguardando: 'var(--yellow)',
            };

            info.innerHTML = `
                <strong style="color:${statusColor[status] || 'var(--text-muted)'}">
                    ${statusLabel[status] || '● —'}
                </strong>
                <span>${cfg.abertura} → ${cfg.fechamento}</span>
            `;
        };

        update();
        setInterval(update, 15000);
    };

    /* ── 2. SCROLL AUTOMÁTICO AO FOCAR INPUT NO MODAL ── */
    const fixModalInputFocus = () => {
        document.addEventListener('focusin', (e) => {
            const input = e.target;
            if (!input.matches('input, select, textarea')) return;

            const modalBody = input.closest('.rf-modal-body, .modal-body');
            if (!modalBody) return;

            // Pequeno delay para o teclado virtual abrir
            setTimeout(() => {
                input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
    };

    /* ── 3. SWIPE DOWN PARA FECHAR MODAIS NO MOBILE ── */
    const addSwipeToClose = () => {
        const overlays = ['modal-rf', 'modal-historico', 'modal-caixa'];
        overlays.forEach(id => {
            const overlay = document.getElementById(id);
            if (!overlay) return;

            const modal = overlay.querySelector('.modal');
            if (!modal) return;

            let startY = 0;
            let isDragging = false;

            modal.addEventListener('touchstart', (e) => {
                // Só ativa se o toque for no header
                if (!e.target.closest('.modal-header')) return;
                startY = e.touches[0].clientY;
                isDragging = true;
            }, { passive: true });

            modal.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                const dy = e.touches[0].clientY - startY;
                if (dy > 0) {
                    modal.style.transform = `translateY(${dy}px)`;
                    modal.style.transition = 'none';
                }
            }, { passive: true });

            modal.addEventListener('touchend', (e) => {
                if (!isDragging) return;
                isDragging = false;
                const dy = e.changedTouches[0].clientY - startY;

                if (dy > 80) {
                    // Swipe down suficiente → fechar
                    modal.style.transition = 'transform 0.25s ease';
                    modal.style.transform = 'translateY(100%)';
                    setTimeout(() => {
                        if (typeof UI !== 'undefined') UI.closeModal(id);
                        modal.style.transform = '';
                        modal.style.transition = '';
                    }, 250);
                } else {
                    // Volta à posição original
                    modal.style.transition = 'transform 0.2s ease';
                    modal.style.transform = '';
                    setTimeout(() => { modal.style.transition = ''; }, 200);
                }
            });
        });
    };

    /* ── 4. INDICADOR DE ARRASTAR NO TOPO DOS MODAIS MOBILE ── */
    const addDragIndicators = () => {
        if (window.innerWidth > 700) return;

        const modalIds = ['modal-rf', 'modal-historico', 'modal-caixa'];
        modalIds.forEach(id => {
            const header = document.querySelector(`#${id} .modal-header`);
            if (!header || header.querySelector('.drag-indicator')) return;

            const indicator = document.createElement('div');
            indicator.className = 'drag-indicator';
            indicator.style.cssText = `
                width: 36px; height: 4px;
                background: var(--border);
                border-radius: 2px;
                margin: 0 auto 12px;
                flex-shrink: 0;
            `;

            // Insere acima do header dentro do modal
            const modal = document.querySelector(`#${id} .modal`);
            if (modal) {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'padding: 10px 0 0; background: var(--bg-card); border-radius: 20px 20px 0 0;';
                wrap.appendChild(indicator);
                modal.insertBefore(wrap, modal.firstChild);
            }
        });
    };

    /* ── INIT ── */
    const init = () => {
        waitForModCaixa(injectCaixaInfoSidebar);
        fixModalInputFocus();

        // Aguarda modais serem criados (ModCaixa e ModRelatorioFinanceiro fazem isso no init)
        setTimeout(() => {
            addSwipeToClose();
            addDragIndicators();
        }, 500);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();