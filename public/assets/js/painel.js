// Painel do Corretor — Coordenador principal de UI/UX
// Conforme Lote 8 do project.md

class PainelCorretor {
  constructor() {
    this.corretorId = null;
    this.perfilData = null;
    this.planoData = null;
    this.cotasData = null;
    this.anunciosData = [];
    this.paginaAnuncios = 1;
    this.publicacoesData = null;
    this.erroPlano = false;
    this.erroCotas = false;
    this.erroAnuncios = false;

    this.inicializar();
  }

  // ========== Inicialização ==========

  async inicializar() {
    this.anexarEventos();
    const perfilCarregado = await this.carregarDados();
    if (perfilCarregado) this.mostrarDashboard();
  }

  anexarEventos() {
    // Navegação
    document.getElementById("nav-dashboard").addEventListener("click", () => this.mostrarDashboard());
    document.getElementById("nav-anuncios").addEventListener("click", () => this.mostrarAnuncios());
    document.getElementById("nav-novo-anuncio").addEventListener("click", () => this.mostrarFormAnuncio());
    document.getElementById("nav-portais").addEventListener("click", () => this.mostrarPortais());
    document.getElementById("nav-publicacoes").addEventListener("click", () => this.mostrarPublicacoes());
    document.getElementById("nav-perfil").addEventListener("click", () => this.mostrarPerfil());
    document.getElementById("logout-btn").addEventListener("click", () => this.logout());

    // Publicações — alterna disponibilidade do campo de URL conforme a fonte escolhida
    document.getElementById("publicacoes-fonte-padrao").addEventListener("change", () => this.atualizarCampoFeedUrl());
    document.getElementById("publicacoes-fonte-proprio").addEventListener("change", () => this.atualizarCampoFeedUrl());
    document.getElementById("form-publicacoes").addEventListener("submit", (e) => this.enviarFormPublicacoes(e));

    // Formulário de anúncio
    document.getElementById("form-anuncio").addEventListener("submit", (e) => this.enviarFormAnuncio(e));
    document.getElementById("cancel-form-btn").addEventListener("click", () => this.mostrarAnuncios());

    // Formulário de perfil
    document.getElementById("form-perfil-editar").addEventListener("submit", (e) => this.enviarFormPerfil(e));
  }

  // ========== Carregamento de dados ==========

  // Retorna true se o perfil (dado crítico, sem o qual o dashboard não
  // pode ser montado) carregou com sucesso. Plano, cotas e anúncios são
  // isolados entre si logo abaixo — a falha de um não deve abortar os
  // outros nem disparar um alerta genérico (ver renderizarDashboard/
  // renderizarPortais/renderizarAnuncios para o tratamento por seção).
  async carregarDados() {
    try {
      const resPerfil = await fetch("/api/painel-corretor/perfil");
      if (!resPerfil.ok) throw new Error("Erro ao buscar perfil");
      this.perfilData = await resPerfil.json();
    } catch (erro) {
      console.error("Erro ao carregar perfil:", erro);
      alert("Erro ao carregar dados do painel. Tente recarregar a página.");
      return false;
    }

    await Promise.all([
      this.carregarPlano(),
      this.carregarCotas(),
      this.carregarPaginaAnuncios(1),
    ]);

    this.atualizarHeaderPerfil();
    this.atualizarStatusOffline();
    return true;
  }

  async carregarPlano() {
    try {
      const res = await fetch("/api/painel-corretor/plano");
      if (!res.ok) throw new Error("Erro ao buscar plano");
      this.planoData = await res.json();
      this.erroPlano = false;
    } catch (erro) {
      console.error("Erro ao carregar plano:", erro);
      this.planoData = null;
      this.erroPlano = true;
    }
  }

  async carregarCotas() {
    try {
      const res = await fetch("/api/painel-corretor/cotas-portal");
      if (!res.ok) throw new Error("Erro ao buscar cotas");
      this.cotasData = await res.json();
      this.erroCotas = false;
    } catch (erro) {
      console.error("Erro ao carregar cotas de portais:", erro);
      this.cotasData = null;
      this.erroCotas = true;
    }
  }

  atualizarHeaderPerfil() {
    const nomeDespedacado = this.perfilData.nome_completo.split(" ")[0];
    document.getElementById("sidebar-user-name").textContent = nomeDespedacado;
  }

  atualizarStatusOffline() {
    if (this.perfilData.status === "pre-cadastro" || this.perfilData.minisite_offline) {
      document.getElementById("status-offline-badge").classList.remove("hidden");
    }
  }

  // ========== Navegação e Views ==========

  mostrarView(viewId) {
    document.querySelectorAll("[id$='-view']").forEach((view) => view.classList.add("hidden"));
    document.getElementById(viewId).classList.remove("hidden");

    // Marca nav button como ativo
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("sidebar-active"));
    const navMapping = {
      "dashboard-view": "nav-dashboard",
      "anuncios-view": "nav-anuncios",
      "form-anuncio-view": "nav-novo-anuncio",
      "portais-view": "nav-portais",
      "publicacoes-view": "nav-publicacoes",
      "perfil-view": "nav-perfil",
    };
    const navId = navMapping[viewId];
    if (navId) document.getElementById(navId).classList.add("sidebar-active");
  }

  mostrarDashboard() {
    this.mostrarView("dashboard-view");
    document.getElementById("page-title").textContent = "Dashboard";
    this.renderizarDashboard();
  }

  mostrarAnuncios() {
    this.mostrarView("anuncios-view");
    document.getElementById("page-title").textContent = "Meus Anúncios";
    this.renderizarAnuncios();
  }

  mostrarFormAnuncio() {
    this.mostrarView("form-anuncio-view");
    document.getElementById("page-title").textContent = "Novo Anúncio";
    this.renderizarFormAnuncio();
  }

  mostrarPortais() {
    this.mostrarView("portais-view");
    document.getElementById("page-title").textContent = "Portais Integrados";
    this.renderizarPortais();
  }

  mostrarPerfil() {
    this.mostrarView("perfil-view");
    document.getElementById("page-title").textContent = "Meu Perfil";
    this.renderizarPerfil();
  }

  async mostrarPublicacoes() {
    this.mostrarView("publicacoes-view");
    document.getElementById("page-title").textContent = "Publicações";
    await this.carregarPublicacoes();
    this.renderizarPublicacoes();
  }

  // ========== Dashboard ==========

  renderizarDashboard() {
    const statusTexto = this.perfilData.status === "aprovado" ? "Aprovado ✅" : "Pendente de Aprovação ⏳";
    const statusSubtexto =
      this.perfilData.status === "aprovado" ? "Seu site está ao vivo!" : "Aguardando verificação de CRECI";

    document.getElementById("status-text").textContent = statusTexto;
    document.getElementById("status-subtext").textContent = statusSubtexto;

    if (this.erroPlano) {
      document.getElementById("anuncios-count").textContent = "—";
      document.getElementById("anuncios-limit").textContent = "Erro ao carregar plano";
      document.getElementById("max-fotos").textContent = "—";
    } else if (!this.planoData.plano) {
      document.getElementById("anuncios-count").textContent = this.planoData.anuncios_usados;
      document.getElementById("anuncios-limit").textContent = "Sem plano atribuído";
      document.getElementById("max-fotos").textContent = "—";
    } else {
      document.getElementById("anuncios-count").textContent = this.planoData.anuncios_usados;
      document.getElementById("anuncios-limit").textContent = `de ${this.planoData.plano.max_anuncios} permitidos`;
      document.getElementById("max-fotos").textContent = this.planoData.plano.max_fotos_por_anuncio;
    }

    const preview = document.getElementById("dashboard-anuncios-preview");
    if (this.erroAnuncios) {
      preview.innerHTML = '<p class="text-red-600">Não foi possível carregar seus anúncios agora.</p>';
    } else if (this.anunciosData.anuncios && this.anunciosData.anuncios.length > 0) {
      preview.innerHTML = this.anunciosData.anuncios.slice(0, 5).map((a) => `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <div>
            <p class="font-medium text-slate-900">${this.escaparHTML(a.titulo)}</p>
            <p class="text-xs text-gray-600">ID: ${a.id} • ${a.postar_na_rede ? "Na rede ✓" : "Restrito"}</p>
          </div>
          <span class="text-sm text-gray-600">${a.atualizado_em ? new Date(a.atualizado_em).toLocaleDateString("pt-BR") : "-"}</span>
        </div>
      `).join("");
    } else {
      preview.innerHTML = '<p class="text-gray-600">Nenhum anúncio cadastrado ainda.</p>';
    }
  }

  // ========== Anúncios ==========

  renderizarAnuncios() {
    const lista = document.getElementById("anuncios-list");

    if (this.erroAnuncios) {
      lista.innerHTML = '<p class="text-red-600 py-8">Não foi possível carregar seus anúncios agora.</p>';
      document.getElementById("anuncios-pagination").innerHTML = "";
      return;
    }

    if (!this.anunciosData.anuncios || this.anunciosData.anuncios.length === 0) {
      lista.innerHTML = '<p class="text-gray-600 py-8">Nenhum anúncio cadastrado. <a href="#" class="text-blue-600 hover:underline">Criar novo</a></p>';
      document.getElementById("anuncios-pagination").innerHTML = "";
      return;
    }

    lista.innerHTML = this.anunciosData.anuncios.map((a) => `
      <div class="bg-white p-4 rounded-lg card-shadow flex justify-between items-center">
        <div class="flex-1">
          <h3 class="font-semibold text-slate-900">${this.escaparHTML(a.titulo)}</h3>
          <p class="text-sm text-gray-600">
            ID: ${a.id} • Preço: R$ ${a.preco_venda || a.preco_aluguel || "A negociar"} • ${a.postar_na_rede ? "✓ Na rede" : "Restrito"}
          </p>
          <p class="text-xs text-gray-500 mt-1">${new Date(a.atualizado_em).toLocaleDateString("pt-BR")}</p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1 bg-blue-100 text-blue-600 rounded text-sm hover:bg-blue-200 transition" onclick="painel.editarAnuncio(${a.id})">✏️ Editar</button>
          <button class="px-3 py-1 bg-red-100 text-red-600 rounded text-sm hover:bg-red-200 transition" onclick="painel.deletarAnuncio(${a.id})">🗑️ Deletar</button>
        </div>
      </div>
    `).join("");

    // Paginação simples
    const totalPages = Math.ceil(this.anunciosData.total / this.anunciosData.per_page);
    const paginacao = document.getElementById("anuncios-pagination");
    paginacao.innerHTML = "";
    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement("button");
      btn.textContent = p;
      btn.className = `px-3 py-1 rounded ${p === this.paginaAnuncios ? "bg-blue-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`;
      btn.addEventListener("click", () => this.carregarPaginaAnuncios(p));
      paginacao.appendChild(btn);
    }
  }

  async carregarPaginaAnuncios(pagina) {
    try {
      const res = await fetch(`/api/painel-corretor/anuncios?pagina=${pagina}`);
      if (!res.ok) throw new Error("Erro ao buscar anúncios");
      this.anunciosData = await res.json();
      this.paginaAnuncios = pagina;
      this.erroAnuncios = false;
    } catch (erro) {
      console.error("Erro ao carregar anúncios:", erro);
      this.anunciosData = { anuncios: [], total: 0, pagina, per_page: 10 };
      this.erroAnuncios = true;
    }
    this.renderizarAnuncios();
  }

  editarAnuncio(id) {
    alert(`Editar anúncio ${id} (Lote 9)`);
  }

  async deletarAnuncio(id) {
    if (!confirm("Tem certeza que deseja deletar este anúncio?")) return;
    alert(`Deletar anúncio ${id} (Lote 5)`);
  }

  // ========== Formulário de Anúncio ==========

  renderizarFormAnuncio() {
    // Carrega selects de taxonomia (Lote 5)
    // Por enquanto, placeholder de valores estáticos
    const tipoImove = document.getElementById("anuncio-tipo");
    tipoImove.innerHTML = `
      <option value="">Tipo de Imóvel</option>
      <option value="apartamento">Apartamento</option>
      <option value="casa">Casa</option>
      <option value="terreno">Terreno</option>
      <option value="comercial">Comercial</option>
    `;

    const cidade = document.getElementById("anuncio-cidade");
    cidade.innerHTML = `
      <option value="">Cidade</option>
      <option value="londrina">Londrina</option>
      <option value="cambé">Cambé</option>
      <option value="maringá">Maringá</option>
    `;
  }

  async enviarFormAnuncio(e) {
    e.preventDefault();
    alert("Salvar anúncio (integração com /painel/anuncios POST do Lote 5)");
  }

  // ========== Portais Integrados ==========

  renderizarPortais() {
    const lista = document.getElementById("portais-list");

    if (this.erroCotas || !this.cotasData) {
      lista.innerHTML = '<p class="text-red-600 py-8">Não foi possível carregar seus portais agora.</p>';
      return;
    }

    if (!this.cotasData.cotas || this.cotasData.cotas.length === 0) {
      lista.innerHTML = '<p class="text-gray-600 py-8">Nenhum portal integrado configurado.</p>';
      return;
    }

    lista.innerHTML = this.cotasData.cotas.map((cota) => `
      <div class="bg-white p-6 rounded-lg card-shadow">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-semibold text-slate-900">${this.formatarNomePortal(cota.portal_nome)}</h3>
            <p class="text-sm text-gray-600">Status: ${cota.ativo ? "✅ Ativo" : "⚠️ Inativo"}</p>
          </div>
          <div class="text-right">
            <p class="text-xl font-bold text-slate-900">${cota.contador}</p>
            <p class="text-xs text-gray-600">anúncios usados</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Quantidade Contratada</label>
            <div class="flex gap-2">
              <input
                type="number"
                placeholder="Ilimitado"
                value="${cota.quantidade_contratada || ""}"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                ${!cota.quantidade_contratada ? "disabled" : ""}
              />
              <button class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition" onclick="painel.alternarIlimitado(this)">
                ${cota.quantidade_contratada ? "Ilimitado?" : "Definir limite?"}
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Ativar/Desativar</label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                ${cota.ativo ? "checked" : ""}
                class="w-4 h-4"
                onchange="painel.atualizarStatusPortal('${cota.portal_nome}', this.checked)"
              />
              <span class="text-sm">${cota.ativo ? "Ativo" : "Inativo"}</span>
            </label>
          </div>
        </div>
      </div>
    `).join("");
  }

  formatarNomePortal(nome) {
    const nomes = {
      "grupo-olx": "🟠 Grupo OLX (OLX + ZAP + VivaReal)",
      "imovelweb": "🏢 ImóvelWeb",
      "chaves-na-mao": "🔑 Chaves na Mão",
    };
    return nomes[nome] || nome;
  }

  alternarIlimitado(btn) {
    alert("Alternar entre ilimitado e com limite (Lote 8)");
  }

  async atualizarStatusPortal(nomePortal, ativo) {
    try {
      const res = await fetch("/api/painel-corretor/cotas-portal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portal_nome: nomePortal,
          ativo: ativo,
        }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar portal");
      alert("Portal atualizado com sucesso!");
      await this.carregarDados();
      this.renderizarPortais();
    } catch (erro) {
      console.error("Erro:", erro);
      alert("Erro ao atualizar portal.");
    }
  }

  // ========== Perfil ==========

  renderizarPerfil() {
    // Dados imutáveis
    document.getElementById("perfil-nome").textContent = this.perfilData.nome_completo;
    document.getElementById("perfil-cpf").textContent = this.perfilData.cpf;
    document.getElementById("perfil-creci").textContent = this.perfilData.creci;
    document.getElementById("perfil-data-nasc").textContent = this.perfilData.data_nascimento
      ? new Date(this.perfilData.data_nascimento).toLocaleDateString("pt-BR")
      : "-";

    // Dados editáveis
    document.getElementById("perfil-email").value = this.perfilData.email || "";
    document.getElementById("perfil-telefone").value = this.perfilData.telefone || "";
    document.getElementById("perfil-whatsapp").value = this.perfilData.whatsapp || "";
    document.getElementById("perfil-endereco").value = this.perfilData.endereco_residencial || "";
  }

  async enviarFormPerfil(e) {
    e.preventDefault();

    try {
      const res = await fetch("/api/painel-corretor/perfil/editar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("perfil-email").value,
          telefone: document.getElementById("perfil-telefone").value,
          whatsapp: document.getElementById("perfil-whatsapp").value,
          endereco_residencial: document.getElementById("perfil-endereco").value,
        }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar perfil");
      alert("Perfil atualizado com sucesso!");
      await this.carregarDados();
      this.renderizarPerfil();
    } catch (erro) {
      console.error("Erro:", erro);
      alert("Erro ao atualizar perfil.");
    }
  }

  // ========== Publicações (Lote 16) ==========

  async carregarPublicacoes() {
    try {
      const res = await fetch("/api/painel-corretor/publicacoes");
      if (!res.ok) throw new Error("Erro ao buscar configuração de Publicações");
      this.publicacoesData = await res.json();
    } catch (erro) {
      console.error("Erro ao carregar Publicações:", erro);
      this.publicacoesData = null;
    }
  }

  renderizarPublicacoes() {
    const bloqueado = document.getElementById("publicacoes-bloqueado");
    const conteudo = document.getElementById("publicacoes-conteudo");

    if (!this.publicacoesData || !this.publicacoesData.permitido_pelo_plano) {
      bloqueado.classList.remove("hidden");
      conteudo.classList.add("hidden");
      return;
    }

    bloqueado.classList.add("hidden");
    conteudo.classList.remove("hidden");

    const { config } = this.publicacoesData;
    document.getElementById("publicacoes-ativo").checked = !!config.ativo;
    document.getElementById("publicacoes-fonte-padrao").checked = config.usarFeedPadrao;
    document.getElementById("publicacoes-fonte-proprio").checked = !config.usarFeedPadrao;
    document.getElementById("publicacoes-feed-url").value = config.feedUrl || "";

    this.atualizarCampoFeedUrl();
  }

  atualizarCampoFeedUrl() {
    const usaFeedProprio = document.getElementById("publicacoes-fonte-proprio").checked;
    const campoUrl = document.getElementById("publicacoes-feed-url");
    campoUrl.disabled = !usaFeedProprio;
    if (!usaFeedProprio) campoUrl.value = "";
  }

  async enviarFormPublicacoes(e) {
    e.preventDefault();

    const usarFeedPadrao = document.getElementById("publicacoes-fonte-padrao").checked;

    try {
      const res = await fetch("/api/painel-corretor/publicacoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativo: document.getElementById("publicacoes-ativo").checked,
          usarFeedPadrao,
          feedUrl: usarFeedPadrao ? null : document.getElementById("publicacoes-feed-url").value,
        }),
      });

      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao salvar configuração");

      alert("Configuração de Publicações salva com sucesso!");
      await this.carregarPublicacoes();
      this.renderizarPublicacoes();
    } catch (erro) {
      console.error("Erro:", erro);
      alert(erro.message || "Erro ao salvar configuração de Publicações.");
    }
  }

  // ========== Logout ==========

  async logout() {
    if (!confirm("Deseja sair do painel?")) return;
    // session_id é HttpOnly — só o backend consegue revogar de verdade
    // (D1 + cookie); limpar client-side não fazia nada.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (erro) {
      console.error("Erro ao encerrar sessão:", erro);
    }
    window.location.href = "/login/";
  }

  // ========== Utilidades ==========

  escaparHTML(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Instancia painel na carga
let painel;
document.addEventListener("DOMContentLoaded", () => {
  painel = new PainelCorretor();
});
