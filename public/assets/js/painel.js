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
    this.anuncioEditandoId = null;

    this.inicializar();
  }

  // ========== Inicialização ==========

  async inicializar() {
    this.anexarEventos();
    await this.carregarDados();
    this.mostrarDashboard();
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
    document.getElementById("cancel-form-btn").addEventListener("click", () => {
      this.anuncioEditandoId = null;
      this.mostrarAnuncios();
    });

    // Formulário de perfil
    document.getElementById("form-perfil-editar").addEventListener("submit", (e) => this.enviarFormPerfil(e));
  }

  // ========== Carregamento de dados ==========

  async carregarDados() {
    try {
      // Busca perfil
      const resPerfil = await fetch("/api/painel-corretor/perfil");
      if (!resPerfil.ok) throw new Error("Erro ao buscar perfil");
      this.perfilData = await resPerfil.json();

      // Busca plano
      const resPlano = await fetch("/api/painel-corretor/plano");
      if (!resPlano.ok) throw new Error("Erro ao buscar plano");
      this.planoData = await resPlano.json();

      // Busca cotas
      const resCotas = await fetch("/api/painel-corretor/cotas-portal");
      if (!resCotas.ok) throw new Error("Erro ao buscar cotas");
      this.cotasData = await resCotas.json();

      // Busca anúncios
      const resAnuncios = await fetch("/api/painel-corretor/anuncios?pagina=1");
      if (!resAnuncios.ok) throw new Error("Erro ao buscar anúncios");
      this.anunciosData = await resAnuncios.json();

      // Atualiza UI com dados do perfil
      this.atualizarHeaderPerfil();
      this.atualizarStatusOffline();
    } catch (erro) {
      console.error("Erro ao carregar dados:", erro);
      alert("Erro ao carregar dados do painel. Tente recarregar a página.");
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

  mostrarFormAnuncio(anuncio = null) {
    this.anuncioEditandoId = anuncio ? anuncio.id : null;
    this.mostrarView("form-anuncio-view");
    const titulo = anuncio ? "Editar Anúncio" : "Novo Anúncio";
    document.getElementById("page-title").textContent = titulo;
    document.getElementById("form-anuncio-titulo").textContent = titulo;
    this.renderizarFormAnuncio(anuncio);
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
    document.getElementById("anuncios-count").textContent = this.planoData.anuncios_usados;
    document.getElementById("anuncios-limit").textContent = `de ${this.planoData.max_anuncios} permitidos`;
    document.getElementById("max-fotos").textContent = this.planoData.max_fotos_por_anuncio;

    const preview = document.getElementById("dashboard-anuncios-preview");
    if (this.anunciosData.anuncios && this.anunciosData.anuncios.length > 0) {
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
      this.renderizarAnuncios();
    } catch (erro) {
      console.error("Erro ao carregar página:", erro);
      alert("Erro ao carregar página de anúncios.");
    }
  }

  async editarAnuncio(id) {
    try {
      const res = await fetch(`/api/anuncios/${id}`);
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao buscar anúncio");
      this.mostrarFormAnuncio(dados.anuncio);
    } catch (erro) {
      console.error("Erro ao carregar anúncio para edição:", erro);
      alert(erro.message || "Erro ao carregar anúncio para edição.");
    }
  }

  async deletarAnuncio(id) {
    if (!confirm("Tem certeza que deseja deletar este anúncio?")) return;

    try {
      const res = await fetch(`/api/anuncios/${id}`, { method: "DELETE" });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao deletar anúncio");

      alert("Anúncio deletado com sucesso!");
      await this.carregarDados();
      this.renderizarAnuncios();
    } catch (erro) {
      console.error("Erro ao deletar anúncio:", erro);
      alert(erro.message || "Erro ao deletar anúncio.");
    }
  }

  // ========== Formulário de Anúncio ==========

  renderizarFormAnuncio(anuncio = null) {
    // Carrega selects de taxonomia (Lote 5)
    // Lista de opções ainda estática (carregamento dinâmico via API fica
    // para o comando dedicado de taxonomia) — os values abaixo são os IDs
    // reais de tipos_imovel/cidades no seed do banco, não mais slugs de
    // texto, para que o submit envie o dado que a API espera.
    const tipoImove = document.getElementById("anuncio-tipo");
    tipoImove.innerHTML = `
      <option value="">Tipo de Imóvel</option>
      <option value="1">Apartamento</option>
      <option value="3">Casa</option>
      <option value="6">Terreno</option>
      <option value="11">Comercial</option>
    `;

    const cidade = document.getElementById("anuncio-cidade");
    cidade.innerHTML = `
      <option value="">Cidade</option>
      <option value="1">Londrina</option>
      <option value="2">Cambé</option>
      <option value="4">Maringá</option>
    `;

    const tipoNegocio = document.getElementById("anuncio-tipo-negocio");
    const categoria = document.getElementById("anuncio-categoria");
    const camposTaxonomia = [tipoNegocio, categoria, tipoImove, cidade];

    if (anuncio) {
      // Taxonomia e cidade são imutáveis após a criação (PUT /api/anuncios/:id
      // não aceita esses campos) — mostrados preenchidos, mas desabilitados.
      document.getElementById("anuncio-titulo").value = anuncio.titulo || "";
      tipoNegocio.value = anuncio.tipo_negocio_id || "";
      categoria.value = anuncio.categoria_imovel_id || "";
      tipoImove.value = anuncio.tipo_imovel_id || "";
      cidade.value = anuncio.cidade_id || "";
      camposTaxonomia.forEach((campo) => (campo.disabled = true));

      document.getElementById("anuncio-descricao").value = anuncio.descricao || "";
      document.getElementById("anuncio-preco").value = anuncio.preco_venda || anuncio.preco_aluguel || "";
      document.getElementById("anuncio-bairro").value = anuncio.bairro || "";
      document.getElementById("anuncio-endereco").value = anuncio.endereco_completo || "";
      document.getElementById("anuncio-exibir-endereco").checked = !!anuncio.exibir_endereco_completo;
      document.getElementById("anuncio-quartos").value = anuncio.quartos ?? "";
      document.getElementById("anuncio-banheiros").value = anuncio.banheiros ?? "";
      document.getElementById("anuncio-vagas").value = anuncio.vagas_garagem ?? "";
      document.getElementById("anuncio-area-util").value = anuncio.area_util ?? "";
      document.getElementById("anuncio-video-youtube").value = anuncio.video_youtube_id
        ? `https://www.youtube.com/watch?v=${anuncio.video_youtube_id}`
        : "";
      document.getElementById("anuncio-tour-360").value = anuncio.tour_360_url || "";
      document.getElementById("anuncio-postar-rede").checked = !!anuncio.postar_na_rede;
    } else {
      camposTaxonomia.forEach((campo) => (campo.disabled = false));
      document.getElementById("form-anuncio").reset();
    }
  }

  async enviarFormAnuncio(e) {
    e.preventDefault();

    const tipoNegocioId = document.getElementById("anuncio-tipo-negocio").value;
    const preco = document.getElementById("anuncio-preco").value;

    const payloadComum = {
      titulo: document.getElementById("anuncio-titulo").value,
      descricao: document.getElementById("anuncio-descricao").value || undefined,
      preco_venda: tipoNegocioId === "1" && preco ? Number(preco) : undefined,
      preco_aluguel: tipoNegocioId === "2" && preco ? Number(preco) : undefined,
      bairro: document.getElementById("anuncio-bairro").value || undefined,
      endereco_completo: document.getElementById("anuncio-endereco").value || undefined,
      exibir_endereco_completo: document.getElementById("anuncio-exibir-endereco").checked,
      quartos: document.getElementById("anuncio-quartos").value ? Number(document.getElementById("anuncio-quartos").value) : undefined,
      banheiros: document.getElementById("anuncio-banheiros").value ? Number(document.getElementById("anuncio-banheiros").value) : undefined,
      vagas_garagem: document.getElementById("anuncio-vagas").value ? Number(document.getElementById("anuncio-vagas").value) : undefined,
      area_util: document.getElementById("anuncio-area-util").value ? Number(document.getElementById("anuncio-area-util").value) : undefined,
      video_youtube_url: document.getElementById("anuncio-video-youtube").value || undefined,
      tour_360_url: document.getElementById("anuncio-tour-360").value || undefined,
      postar_na_rede: document.getElementById("anuncio-postar-rede").checked,
    };

    try {
      let res;
      if (this.anuncioEditandoId) {
        res = await fetch(`/api/anuncios/${this.anuncioEditandoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadComum),
        });
      } else {
        const payloadCriacao = {
          ...payloadComum,
          tipo_negocio_id: Number(tipoNegocioId),
          categoria_imovel_id: Number(document.getElementById("anuncio-categoria").value),
          tipo_imovel_id: Number(document.getElementById("anuncio-tipo").value),
          cidade_id: Number(document.getElementById("anuncio-cidade").value),
        };
        res = await fetch("/api/anuncios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadCriacao),
        });
      }

      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao salvar anúncio");

      alert(this.anuncioEditandoId ? "Anúncio atualizado com sucesso!" : "Anúncio criado com sucesso!");
      this.anuncioEditandoId = null;
      await this.carregarDados();
      this.mostrarAnuncios();
    } catch (erro) {
      console.error("Erro ao salvar anúncio:", erro);
      alert(erro.message || "Erro ao salvar anúncio.");
    }
  }

  // ========== Portais Integrados ==========

  renderizarPortais() {
    const lista = document.getElementById("portais-list");

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

  logout() {
    if (confirm("Deseja sair do painel?")) {
      document.cookie = "session_id=; max-age=0";
      window.location.href = "/";
    }
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
