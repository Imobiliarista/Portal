// Painel do Superadmin — lógica client-side (Lote 9)
// Consuma as APIs em /painel-admin/*

const API_BASE = "/painel-admin";

let paginaAtual = "dashboard";
let precadastroAtualId = null;
let cidadeAtualId = null;

// ========== Inicialização ==========

document.addEventListener("DOMContentLoaded", async () => {
  configurarNavegacao();
  configurarLogout();
  await carregarDashboard();
});

// ========== Navegação ==========

function configurarNavegacao() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const secao = btn.dataset.section;
      mudarSecao(secao);
    });
  });
}

function mudarSecao(secao) {
  // Atualizar botões de navegação
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.remove("nav-btn-active");
  });
  document.querySelector(`[data-section="${secao}"]`).classList.add("nav-btn-active");

  // Esconder todas as seções
  document.getElementById("dashboard-view").classList.add("hidden");
  document.getElementById("precadastros-view").classList.add("hidden");
  document.getElementById("cidades-view").classList.add("hidden");
  document.getElementById("modulos-view").classList.add("hidden");

  // Mostrar seção escolhida e carregar dados
  paginaAtual = secao;
  document.getElementById(`${secao}-view`).classList.remove("hidden");

  // Atualizar título
  const titulos = {
    dashboard: "📊 Dashboard",
    precadastros: "✅ Aprovações",
    cidades: "🏙️ Cidades",
    modulos: "🧩 Módulos"
  };
  document.getElementById("page-title").textContent = titulos[secao];

  // Carregar dados da seção
  if (secao === "precadastros") carregarPreCadastros();
  if (secao === "cidades") carregarCidades();
  if (secao === "modulos") carregarModulos();
}

// ========== Dashboard ==========

async function carregarDashboard() {
  try {
    const resposta = await fetch(`${API_BASE}/visao-geral`);
    if (!resposta.ok) throw new Error("Erro ao carregar visão geral");

    const dados = await resposta.json();

    document.getElementById("stat-corretores-totais").textContent = dados.dados.corretores_totais;
    document.getElementById("stat-corretores-aprovados").textContent = dados.dados.corretores_aprovados;
    document.getElementById("stat-corretores-pendentes").textContent = dados.dados.corretores_pendentes;
    document.getElementById("stat-corretores-reprovados").textContent = dados.dados.corretores_reprovados;
    document.getElementById("stat-anuncios-totais").textContent = dados.dados.anuncios_totais;
    document.getElementById("stat-anuncios-rede").textContent = dados.dados.anuncios_na_rede;
    document.getElementById("stat-anuncios-privados").textContent = dados.dados.anuncios_privados;
  } catch (erro) {
    console.error("Erro ao carregar dashboard:", erro);
  }
}

// ========== Pré-Cadastros ==========

async function carregarPreCadastros() {
  try {
    const resposta = await fetch(`${API_BASE}/pre-cadastros?pagina=1`);
    if (!resposta.ok) throw new Error("Erro ao carregar pré-cadastros");

    const dados = await resposta.json();
    const lista = document.getElementById("precadastros-lista");
    lista.innerHTML = "";

    if (dados.dados.length === 0) {
      lista.innerHTML = "<p class='text-gray-600 text-sm'>Nenhum pré-cadastro pendente</p>";
      document.getElementById("precadastros-contador").textContent = "0 pendentes";
      return;
    }

    document.getElementById("precadastros-contador").textContent = `${dados.dados.length} pendente(s)`;

    dados.dados.forEach(precadastro => {
      const card = document.createElement("div");
      card.className = "bg-white p-4 rounded-lg card-shadow hover:shadow-lg transition cursor-pointer";
      card.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <p class="font-semibold text-slate-900">${precadastro.nome}</p>
            <p class="text-xs text-gray-600 mt-1">${precadastro.email}</p>
            <p class="text-xs text-gray-600">CRECI: ${precadastro.creci}</p>
          </div>
          <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Pendente</span>
        </div>
      `;
      card.addEventListener("click", () => abrirDetalhesPreCadastro(precadastro.id));
      lista.appendChild(card);
    });
  } catch (erro) {
    console.error("Erro ao carregar pré-cadastros:", erro);
  }
}

async function abrirDetalhesPreCadastro(id) {
  try {
    const resposta = await fetch(`${API_BASE}/pre-cadastro/${id}`);
    if (!resposta.ok) throw new Error("Erro ao buscar pré-cadastro");

    const precadastro = await resposta.json();
    precadastroAtualId = precadastro.dados.id;

    const detalhesDiv = document.getElementById("precadastro-detalhes");
    detalhesDiv.innerHTML = `
      <p><strong>Nome:</strong> ${precadastro.dados.nome}</p>
      <p><strong>Email:</strong> ${precadastro.dados.email}</p>
      <p><strong>Telefone:</strong> ${precadastro.dados.telefone}</p>
      <p><strong>CRECI:</strong> ${precadastro.dados.creci}</p>
      <p><strong>Aceite de Termos:</strong> ${precadastro.dados.aceite_termos_em ? new Date(precadastro.dados.aceite_termos_em).toLocaleDateString("pt-BR") : "Não aceito"}</p>
    `;

    document.getElementById("precadastro-modal").classList.remove("hidden");
  } catch (erro) {
    console.error("Erro ao abrir detalhes:", erro);
    alert("Erro ao carregar detalhes do pré-cadastro");
  }
}

function fecharModalPreCadastro() {
  document.getElementById("precadastro-modal").classList.add("hidden");
  precadastroAtualId = null;
  document.getElementById("precadastro-slug").value = "";
}

// Listeners do modal de pré-cadastro
document.getElementById("precadastro-fechar-btn").addEventListener("click", fecharModalPreCadastro);

document.getElementById("precadastro-aprovar-btn").addEventListener("click", async () => {
  const slug = document.getElementById("precadastro-slug").value.trim();
  if (!slug) {
    alert("Digite o slug do minisite");
    return;
  }

  try {
    const resposta = await fetch(`${API_BASE}/pre-cadastro/${precadastroAtualId}/aprovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug_minisite: slug })
    });

    if (!resposta.ok) throw new Error("Erro ao aprovar");

    alert("✅ Pré-cadastro aprovado com sucesso!");
    fecharModalPreCadastro();
    carregarPreCadastros();
  } catch (erro) {
    console.error("Erro ao aprovar:", erro);
    alert("Erro ao aprovar pré-cadastro");
  }
});

document.getElementById("precadastro-reprovar-btn").addEventListener("click", async () => {
  const motivo = prompt("Motivo da reprovação (opcional):");

  try {
    const resposta = await fetch(`${API_BASE}/pre-cadastro/${precadastroAtualId}/reprovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: motivo || "" })
    });

    if (!resposta.ok) throw new Error("Erro ao reprovar");

    alert("❌ Pré-cadastro reprovado");
    fecharModalPreCadastro();
    carregarPreCadastros();
  } catch (erro) {
    console.error("Erro ao reprovar:", erro);
    alert("Erro ao reprovar pré-cadastro");
  }
});

// ========== Cidades ==========

async function carregarCidades() {
  try {
    const resposta = await fetch(`${API_BASE}/cidades?pagina=1`);
    if (!resposta.ok) throw new Error("Erro ao carregar cidades");

    const dados = await resposta.json();
    const lista = document.getElementById("cidades-lista");
    lista.innerHTML = "";

    document.getElementById("cidades-contador").textContent = `${dados.dados.length} cidades`;

    dados.dados.slice(0, 50).forEach(cidade => {
      const card = document.createElement("div");
      card.className = "bg-white p-4 rounded-lg card-shadow hover:shadow-lg transition flex justify-between items-center";
      const statusBadge = cidade.ativo ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800";
      const statusTexto = cidade.ativo ? "Ativa" : "Inativa";
      card.innerHTML = `
        <div>
          <p class="font-semibold text-slate-900">${cidade.nome}</p>
          <p class="text-xs text-gray-600">${cidade.uf}</p>
        </div>
        <div class="flex gap-2 items-center">
          <span class="text-xs px-2 py-1 rounded ${statusBadge}">${statusTexto}</span>
          <button class="text-blue-600 hover:text-blue-800 text-sm font-semibold">Editar</button>
        </div>
      `;
      card.querySelector("button").addEventListener("click", () => abrirModalCidade(cidade));
      lista.appendChild(card);
    });
  } catch (erro) {
    console.error("Erro ao carregar cidades:", erro);
  }
}

function abrirModalCidade(cidade) {
  cidadeAtualId = cidade.id;
  document.getElementById("cidade-nome-input").value = cidade.nome;
  document.getElementById("cidade-ativo-input").checked = cidade.ativo;
  document.getElementById("cidade-modal").classList.remove("hidden");
}

function fecharModalCidade() {
  document.getElementById("cidade-modal").classList.add("hidden");
  cidadeAtualId = null;
}

document.getElementById("cidade-fechar-btn").addEventListener("click", fecharModalCidade);

document.getElementById("cidade-salvar-btn").addEventListener("click", async () => {
  const nome = document.getElementById("cidade-nome-input").value.trim();
  const ativo = document.getElementById("cidade-ativo-input").checked;

  if (!nome) {
    alert("Digite o nome da cidade");
    return;
  }

  try {
    const resposta = await fetch(`${API_BASE}/cidade/${cidadeAtualId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, ativo })
    });

    if (!resposta.ok) throw new Error("Erro ao atualizar");

    alert("✅ Cidade atualizada com sucesso!");
    fecharModalCidade();
    carregarCidades();
  } catch (erro) {
    console.error("Erro ao atualizar cidade:", erro);
    alert("Erro ao atualizar cidade");
  }
});

// ========== Módulos ==========

async function carregarModulos() {
  try {
    const resposta = await fetch(`${API_BASE}/modulos`);
    if (!resposta.ok) throw new Error("Erro ao carregar módulos");

    const dados = await resposta.json();
    const lista = document.getElementById("modulos-lista");
    lista.innerHTML = "";

    if (dados.dados.length === 0) {
      lista.innerHTML = "<p class='text-gray-600'>Nenhum módulo disponível</p>";
      return;
    }

    dados.dados.forEach(modulo => {
      const card = document.createElement("div");
      card.className = "bg-white p-4 rounded-lg card-shadow flex justify-between items-center";
      card.innerHTML = `
        <div>
          <p class="font-semibold text-slate-900">${modulo.nome}</p>
          <p class="text-xs text-gray-600">${modulo.descricao || "Sem descrição"}</p>
        </div>
        <div class="flex items-center gap-4">
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" class="toggle-modulo sr-only" data-modulo-id="${modulo.id}" ${modulo.ativo ? "checked" : ""} />
            <div class="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
          <span class="text-xs font-semibold ${modulo.ativo ? "text-green-600" : "text-gray-600"}">
            ${modulo.ativo ? "Ativo" : "Inativo"}
          </span>
        </div>
      `;

      const toggle = card.querySelector(".toggle-modulo");
      toggle.addEventListener("change", async (e) => {
        await alternarModulo(modulo.id, e.target.checked);
      });

      lista.appendChild(card);
    });
  } catch (erro) {
    console.error("Erro ao carregar módulos:", erro);
  }
}

async function alternarModulo(moduloId, ativo) {
  try {
    const resposta = await fetch(`${API_BASE}/modulo/${moduloId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo })
    });

    if (!resposta.ok) throw new Error("Erro ao alterar");

    // Recarregar para refletir mudança de status
    carregarModulos();
  } catch (erro) {
    console.error("Erro ao alterar módulo:", erro);
    alert("Erro ao alterar módulo");
  }
}

// ========== Logout ==========

function configurarLogout() {
  document.getElementById("logout-btn").addEventListener("click", () => {
    if (confirm("Tem certeza que deseja sair?")) {
      // Implementar logout real quando tiver rota de logout
      window.location.href = "/";
    }
  });
}
