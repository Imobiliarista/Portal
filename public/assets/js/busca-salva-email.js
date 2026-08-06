// Componente: Botão "Salvar esta busca" com modal para capturar e-mail
// Lote 12.6 — busca-salva-email
// Aparece apenas quando o módulo está ativo

(function () {
  'use strict';

  const MODULO_NOME = 'busca-salva-email';

  /**
   * Verifica se o módulo está ativo consultando o data attribute no HTML
   */
  function estaModuloAtivo() {
    const html = document.documentElement;
    const modulosAtivos = html.getAttribute('data-modulos-ativos');
    if (!modulosAtivos) {
      return false;
    }
    const modulos = modulosAtivos.split(',').map(m => m.trim());
    return modulos.includes(MODULO_NOME);
  }

  /**
   * Obtém os critérios atuais de busca do estado da aplicação
   */
  function obterCriteriosAtivos() {
    // Lê os critérios do filtro atualmente ativo
    // Espera uma função global que retorna os critérios
    if (typeof window.obterCriteriosAtivos === 'function') {
      return window.obterCriteriosAtivos();
    }

    // Fallback: tenta extrair da URL ou sessionStorage
    const criterios = sessionStorage.getItem('filtros_busca');
    if (criterios) {
      try {
        return JSON.parse(criterios);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Abre o modal para capturar o e-mail
   */
  function abrirModalEmail(criterios) {
    // Remove modal antigo se existir
    const modalAntigo = document.getElementById('modal-busca-salva');
    if (modalAntigo) {
      modalAntigo.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'modal-busca-salva';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-conteudo">
        <div class="modal-header">
          <h2>Salvar essa busca</h2>
          <button class="modal-fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body">
          <p>Receba notificações quando novos imóveis corresponderem a seus critérios.</p>
          <form id="form-salvar-busca">
            <div class="form-group">
              <label for="email-salvar-busca">Seu e-mail:</label>
              <input
                type="email"
                id="email-salvar-busca"
                name="email"
                placeholder="seu@email.com"
                required
                autocomplete="email"
              />
            </div>
            <button type="submit" class="btn-salvar">Salvar Busca</button>
          </form>
          <p style="font-size: 12px; color: #999; margin-top: 12px;">
            Você receberá um e-mail com um link para cancelar a busca a qualquer momento.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Estilos embutidos (fallback se CSS não carregar)
    if (!document.getElementById('estilos-busca-salva')) {
      const estilos = document.createElement('style');
      estilos.id = 'estilos-busca-salva';
      estilos.textContent = `
        .modal-overlay {
          display: flex;
          align-items: center;
          justify-content: center;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
        }

        .modal-conteudo {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          max-width: 400px;
          width: 90%;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #eee;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 18px;
        }

        .modal-fechar {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
        }

        .modal-body {
          padding: 16px;
        }

        .form-group {
          margin-bottom: 12px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          font-size: 14px;
        }

        .form-group input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .form-group input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
        }

        .btn-salvar {
          width: 100%;
          padding: 10px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-salvar:hover {
          background: #0056b3;
        }

        .btn-salvar:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .msg-sucesso {
          background: #d4edda;
          color: #155724;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 14px;
        }

        .msg-erro {
          background: #f8d7da;
          color: #721c24;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 12px;
          font-size: 14px;
        }
      `;
      document.head.appendChild(estilos);
    }

    // Handlers
    const form = modal.querySelector('#form-salvar-busca');
    const btnFechar = modal.querySelector('.modal-fechar');

    btnFechar.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.querySelector('#email-salvar-busca').value;
      salvarBusca(email, criterios, modal);
    });

    // Foco no campo de e-mail
    modal.querySelector('#email-salvar-busca').focus();
  }

  /**
   * Envia a busca salva para o servidor
   */
  async function salvarBusca(email, criterios, modal) {
    const btnSubmit = modal.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Salvando...';

    try {
      const response = await fetch('/api/busca-salva/salvar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          criterios,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Sucesso
        const body = modal.querySelector('.modal-body');
        body.innerHTML = `
          <div class="msg-sucesso">
            <strong>✓ Busca salva!</strong>
            <p>Você receberá notificações por e-mail quando novos imóveis corresponderem a seus critérios.</p>
            <p style="margin: 8px 0 0 0; font-size: 12px;">
              Um link de cancelamento foi enviado para <strong>${email}</strong>
            </p>
          </div>
          <button class="btn-fechar" onclick="this.closest('.modal-overlay').remove();">Fechar</button>
        `;
      } else {
        // Erro
        const msgErro = data.erro || 'Erro ao salvar busca';
        const body = modal.querySelector('.modal-body');
        const mensagem = document.createElement('div');
        mensagem.className = 'msg-erro';
        mensagem.textContent = `✕ ${msgErro}`;
        body.insertBefore(mensagem, body.firstChild);

        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Salvar Busca';
      }
    } catch (erro) {
      console.error('Erro ao salvar busca:', erro);
      const body = modal.querySelector('.modal-body');
      const mensagem = document.createElement('div');
      mensagem.className = 'msg-erro';
      mensagem.textContent = '✕ Erro de conexão. Tente novamente.';
      body.insertBefore(mensagem, body.firstChild);

      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Salvar Busca';
    }
  }

  /**
   * Inicializa o componente: cria o botão se o módulo estiver ativo
   */
  function inicializar() {
    if (!estaModuloAtivo()) {
      return;
    }

    // Procura por container de botões ou cria um
    const containerBotoes = document.querySelector('[data-busca-salva-container]');
    if (!containerBotoes) {
      return;
    }

    const btn = document.createElement('button');
    btn.id = 'btn-salvar-busca';
    btn.className = 'btn-salvar-busca';
    btn.innerHTML = '💾 Salvar esta busca';
    btn.addEventListener('click', () => {
      const criterios = obterCriteriosAtivos();
      if (criterios) {
        abrirModalEmail(criterios);
      } else {
        alert('Nenhum critério de busca encontrado.');
      }
    });

    containerBotoes.appendChild(btn);
  }

  // Inicia quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }
})();
