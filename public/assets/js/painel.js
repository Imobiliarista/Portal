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
    this.taxonomiaData = null;
    this.editandoAnuncioId = null;

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
    document.getElementById("novo-anuncio-btn-header").addEventListener("click", () => this.mostrarFormAnuncio());
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
    document.getElementById("anuncio-categoria").addEventListener("change", () => this.atualizarSelectTipoImovel());
    document.getElementById("anuncio-publicar-grupo-olx").addEventListener("change", () => this.atualizarObrigatoriedadeCep());

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
    // Sempre reseta o modo de edição — sem isso, cancelar uma edição e
    // depois clicar em "Novo Anúncio" submeteria como PUT no anúncio
    // editado antes, não como POST de um anúncio novo.
    this.editandoAnuncioId = null;
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
      lista.innerHTML = '<p class="text-gray-600 py-8">Nenhum anúncio cadastrado. <a href="#" onclick="painel.mostrarFormAnuncio(); return false;" class="text-blue-600 hover:underline">Criar novo</a></p>';
      document.getElementById("anuncios-pagination").innerHTML = "";
      return;
    }

    lista.innerHTML = this.anunciosData.anuncios.map((a) => `
      <div class="bg-white p-4 rounded-lg card-shadow flex justify-between items-center">
        <div class="flex-1">
          <h3 class="font-semibold text-slate-900">${this.escaparHTML(a.titulo)}</h3>
          <p class="text-sm text-gray-600">
            ID: ${a.id} • Preço: R$ ${a.preco_venda || a.preco_aluguel || "A negociar"} • ${a.vendido_removido ? "🚫 Vendido/Removido" : (a.postar_na_rede ? "✓ Na rede" : "Restrito")}
          </p>
          <p class="text-xs text-gray-500 mt-1">${new Date(a.atualizado_em).toLocaleDateString("pt-BR")}</p>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-1 bg-blue-100 text-blue-600 rounded text-sm hover:bg-blue-200 transition" onclick="painel.editarAnuncio(${a.id})">✏️ Editar</button>
          ${a.vendido_removido ? "" : `<button class="px-3 py-1 bg-red-100 text-red-600 rounded text-sm hover:bg-red-200 transition" onclick="painel.deletarAnuncio(${a.id})">🗑️ Deletar</button>`}
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

  async editarAnuncio(id) {
    try {
      await this.garantirTaxonomiaCarregada();

      const res = await fetch(`/api/anuncios/${id}`);
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao buscar anúncio");

      this.editandoAnuncioId = id;
      this.mostrarView("form-anuncio-view");
      document.getElementById("page-title").textContent = "Editar Anúncio";
      document.getElementById("form-anuncio-titulo").textContent = "Editar Anúncio";

      this.preencherFormAnuncio(dados.anuncio);
    } catch (erro) {
      console.error("Erro ao carregar anúncio:", erro);
      alert(erro.message || "Erro ao carregar anúncio pra edição.");
    }
  }

  async deletarAnuncio(id) {
    if (!confirm("Tem certeza que deseja deletar este anúncio? Ele será marcado como vendido/removido.")) return;

    try {
      const res = await fetch(`/api/anuncios/${id}`, { method: "DELETE" });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao deletar anúncio");

      alert(dados.mensagem || "Anúncio removido com sucesso!");
      await this.carregarPaginaAnuncios(this.paginaAnuncios);
    } catch (erro) {
      console.error("Erro ao deletar anúncio:", erro);
      alert(erro.message || "Erro ao deletar anúncio.");
    }
  }

  // ========== Formulário de Anúncio ==========

  // Busca a taxonomia (tipos de negócio, categorias→tipos de imóvel,
  // cidades) uma vez só e reaproveita — dado de referência, igual pra
  // qualquer anúncio, não precisa recarregar a cada abertura do formulário.
  async garantirTaxonomiaCarregada() {
    if (this.taxonomiaData) return;

    const res = await fetch("/api/painel-corretor/taxonomia");
    if (!res.ok) throw new Error("Erro ao buscar taxonomia");
    this.taxonomiaData = await res.json();

    const cidade = document.getElementById("anuncio-cidade");
    cidade.innerHTML =
      '<option value="">Cidade</option>' +
      this.taxonomiaData.cidades
        .map((c) => `<option value="${c.id}">${this.escaparHTML(c.nome)} - ${c.uf}</option>`)
        .join("");
  }

  // Repopula o select de Tipo de Imóvel a partir da Categoria escolhida —
  // cada categoria tem um conjunto diferente de tipos (seção 5.3).
  // `tipoImovelIdSelecionado` é usado só na edição, pra restaurar o valor
  // depois de repopular as opções.
  atualizarSelectTipoImovel(tipoImovelIdSelecionado) {
    const categoriaSlug = document.getElementById("anuncio-categoria").value;
    const tipoSelect = document.getElementById("anuncio-tipo");

    const categoria = this.taxonomiaData?.categorias.find((c) => c.slug === categoriaSlug);
    if (!categoria) {
      tipoSelect.innerHTML = '<option value="">Tipo de Imóvel</option>';
      return;
    }

    tipoSelect.innerHTML =
      '<option value="">Tipo de Imóvel</option>' +
      categoria.tipos_imovel.map((t) => `<option value="${t.id}">${this.escaparHTML(t.nome)}</option>`).join("");

    if (tipoImovelIdSelecionado) {
      tipoSelect.value = String(tipoImovelIdSelecionado);
    }
  }

  // CEP só é obrigatório quando o corretor marca "Publicar no Grupo OLX"
  // (seção 4.11) — mesma regra do backend (api-anuncios-crud.ts), aplicada
  // aqui só pra dar feedback antes de tentar salvar.
  atualizarObrigatoriedadeCep() {
    const publicarGrupoOlx = document.getElementById("anuncio-publicar-grupo-olx").checked;
    const cepInput = document.getElementById("anuncio-cep");
    const ajuda = document.getElementById("anuncio-cep-ajuda");

    cepInput.required = publicarGrupoOlx;
    ajuda.textContent = publicarGrupoOlx
      ? "Obrigatório pra publicar no Grupo OLX."
      : 'Obrigatório só se você marcar "Publicar no Grupo OLX" abaixo.';
  }

  limparFormAnuncio() {
    document.getElementById("form-anuncio").reset();
    document.getElementById("anuncio-tipo").innerHTML = '<option value="">Tipo de Imóvel</option>';
    document.getElementById("anuncio-postar-rede").checked = true;
    document.getElementById("anuncio-publicar-grupo-olx").checked = false;
    this.atualizarObrigatoriedadeCep();
  }

  async renderizarFormAnuncio() {
    try {
      await this.garantirTaxonomiaCarregada();
    } catch (erro) {
      console.error("Erro ao carregar taxonomia:", erro);
      alert("Erro ao carregar categorias/cidades. Tente recarregar a página.");
      return;
    }

    if (!this.editandoAnuncioId) {
      document.getElementById("form-anuncio-titulo").textContent = "Novo Anúncio";
      this.limparFormAnuncio();
    }
  }

  // Preenche o formulário com um anúncio existente (edição). `anuncio` vem
  // direto de GET /api/anuncios/:id — campos de taxonomia são IDs (banco),
  // não slugs, então tipo de negócio/categoria precisam de busca reversa
  // na taxonomia já carregada pra achar o slug que o <select> usa como value.
  preencherFormAnuncio(anuncio) {
    const tipoNegocio = this.taxonomiaData.tipos_negocio.find((t) => t.id === anuncio.tipo_negocio_id);
    const categoria = this.taxonomiaData.categorias.find((c) => c.id === anuncio.categoria_imovel_id);

    document.getElementById("anuncio-titulo").value = anuncio.titulo || "";
    document.getElementById("anuncio-tipo-negocio").value = tipoNegocio?.slug || "";
    document.getElementById("anuncio-descricao").value = anuncio.descricao || "";
    document.getElementById("anuncio-categoria").value = categoria?.slug || "";
    this.atualizarSelectTipoImovel(anuncio.tipo_imovel_id);
    document.getElementById("anuncio-cidade").value = String(anuncio.cidade_id || "");
    document.getElementById("anuncio-preco").value = anuncio.preco_venda ?? anuncio.preco_aluguel ?? "";
    document.getElementById("anuncio-bairro").value = anuncio.bairro || "";
    document.getElementById("anuncio-endereco").value = anuncio.endereco_completo || "";
    document.getElementById("anuncio-exibir-endereco").checked = !!anuncio.exibir_endereco_completo;
    document.getElementById("anuncio-cep").value = anuncio.cep || "";
    document.getElementById("anuncio-quartos").value = anuncio.quartos ?? "";
    document.getElementById("anuncio-banheiros").value = anuncio.banheiros ?? "";
    document.getElementById("anuncio-vagas").value = anuncio.vagas_garagem ?? "";
    document.getElementById("anuncio-area-util").value = anuncio.area_util ?? "";
    document.getElementById("anuncio-video-youtube").value = "";
    document.getElementById("anuncio-tour-360").value = anuncio.tour_360_url || "";
    document.getElementById("anuncio-postar-rede").checked = !!anuncio.postar_na_rede;
    document.getElementById("anuncio-publicar-grupo-olx").checked = !!anuncio.publicar_grupo_olx;
    this.atualizarObrigatoriedadeCep();
  }

  // Monta o payload a partir dos campos do formulário. Retorna
  // { payload } em caso de sucesso ou { erro } se alguma validação de
  // frontend falhar — mesmas regras já aplicadas no backend
  // (api-anuncios-crud.ts), checadas aqui só pra dar feedback mais rápido.
  coletarPayloadFormAnuncio() {
    const tipoNegocioSlug = document.getElementById("anuncio-tipo-negocio").value;
    const categoriaSlug = document.getElementById("anuncio-categoria").value;
    const tipoImovelId = document.getElementById("anuncio-tipo").value;
    const cidadeId = document.getElementById("anuncio-cidade").value;
    const cep = document.getElementById("anuncio-cep").value.trim();
    const publicarGrupoOlx = document.getElementById("anuncio-publicar-grupo-olx").checked;

    const tipoNegocio = this.taxonomiaData.tipos_negocio.find((t) => t.slug === tipoNegocioSlug);
    const categoria = this.taxonomiaData.categorias.find((c) => c.slug === categoriaSlug);

    if (!tipoNegocio || !categoria || !tipoImovelId || !cidadeId) {
      return { erro: "Preencha tipo de negócio, categoria, tipo de imóvel e cidade." };
    }

    if (publicarGrupoOlx && !cep) {
      return { erro: "CEP é obrigatório pra publicar no Grupo OLX." };
    }

    const preco = document.getElementById("anuncio-preco").value;
    const precoNumero = preco ? Number(preco) : undefined;

    const payload = {
      titulo: document.getElementById("anuncio-titulo").value.trim(),
      descricao: document.getElementById("anuncio-descricao").value.trim() || undefined,
      tipo_negocio_id: tipoNegocio.id,
      categoria_imovel_id: categoria.id,
      tipo_imovel_id: Number(tipoImovelId),
      cidade_id: Number(cidadeId),
      // Preço vai só no campo certo pra classificação do anúncio — mesma
      // regra do backend (lib/feeds/core.ts::resolverPrecos): nunca os
      // dois preenchidos ao mesmo tempo, pra não confundir precedência
      // depois numa troca de tipo de negócio.
      preco_venda: tipoNegocioSlug === "venda" ? precoNumero : undefined,
      preco_aluguel: tipoNegocioSlug === "locacao" ? precoNumero : undefined,
      bairro: document.getElementById("anuncio-bairro").value.trim() || undefined,
      endereco_completo: document.getElementById("anuncio-endereco").value.trim() || undefined,
      exibir_endereco_completo: document.getElementById("anuncio-exibir-endereco").checked,
      cep: cep || undefined,
      quartos: document.getElementById("anuncio-quartos").value ? Number(document.getElementById("anuncio-quartos").value) : undefined,
      banheiros: document.getElementById("anuncio-banheiros").value ? Number(document.getElementById("anuncio-banheiros").value) : undefined,
      vagas_garagem: document.getElementById("anuncio-vagas").value ? Number(document.getElementById("anuncio-vagas").value) : undefined,
      area_util: document.getElementById("anuncio-area-util").value ? Number(document.getElementById("anuncio-area-util").value) : undefined,
      video_youtube_url: document.getElementById("anuncio-video-youtube").value.trim() || undefined,
      tour_360_url: document.getElementById("anuncio-tour-360").value.trim() || undefined,
      postar_na_rede: document.getElementById("anuncio-postar-rede").checked,
      publicar_grupo_olx: publicarGrupoOlx,
    };

    return { payload };
  }

  async enviarFormAnuncio(e) {
    e.preventDefault();

    if (!this.taxonomiaData) {
      alert("Categorias/cidades ainda não carregaram. Aguarde um instante e tente de novo.");
      return;
    }

    const { payload, erro } = this.coletarPayloadFormAnuncio();
    if (erro) {
      alert(erro);
      return;
    }

    if (!payload.titulo) {
      alert("Título é obrigatório.");
      return;
    }

    const editando = !!this.editandoAnuncioId;
    const url = editando ? `/api/anuncios/${this.editandoAnuncioId}` : "/api/anuncios";
    const metodo = editando ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const dados = await res.json();
      if (!res.ok) throw new Error(dados.erro || "Erro ao salvar anúncio");

      alert(dados.aviso || dados.mensagem || (editando ? "Anúncio atualizado com sucesso!" : "Anúncio criado com sucesso!"));

      this.editandoAnuncioId = null;
      await this.carregarPaginaAnuncios(1);
      this.mostrarAnuncios();
    } catch (erro) {
      console.error("Erro ao salvar anúncio:", erro);
      alert(erro.message || "Erro ao salvar anúncio.");
    }
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
