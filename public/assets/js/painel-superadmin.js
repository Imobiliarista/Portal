// Painel do Superadmin — lógica client-side (Lote 9)
// Consuma as APIs em /api/painel-admin/*

const API_BASE = "/api/painel-admin";

let paginaAtual = "dashboard";
let precadastroAtualId = null;
let cidadeAtualId = null;
let minisitesPaginaAtual = 1;
let minisitesTotal = 0;
const MINISITES_POR_PAGINA = 50;
let minisitesBuscaDebounce = null;
let minisiteEditarCorretorId = null;
let minisiteAprovarPreCadastroId = null;

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
  document.getElementById("minisites-view").classList.add("hidden");
  document.getElementById("precadastros-view").classList.add("hidden");
  document.getElementById("cidades-view").classList.add("hidden");
  document.getElementById("modulos-view").classList.add("hidden");

  // Mostrar seção escolhida e carregar dados
  paginaAtual = secao;
  document.getElementById(`${secao}-view`).classList.remove("hidden");

  // Atualizar título
  const titulos = {
    dashboard: "📊 Dashboard",
    minisites: "🌐 Minisites",
    precadastros: "✅ Aprovações",
    cidades: "🏙️ Cidades",
    modulos: "🧩 Módulos"
  };
  document.getElementById("page-title").textContent = titulos[secao];

  // Carregar dados da seção
  if (secao === "minisites") carregarMinisites();
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

// ========== Minisites (gestão completa da rede) ==========

const STATUS_MINISITE_LABEL = {
  "pre-cadastro": { texto: "Pré-cadastro pendente", classe: "bg-yellow-100 text-yellow-800" },
  "aprovado-online": { texto: "Aprovado — Online", classe: "bg-green-100 text-green-800" },
  "aprovado-offline": { texto: "Offline — Suspenso", classe: "bg-gray-200 text-gray-800" },
  "reprovado": { texto: "Reprovado", classe: "bg-red-100 text-red-800" }
};

function statusMinisiteDe(item) {
  if (item.status_corretor === "pre-cadastro") return "pre-cadastro";
  if (item.status_corretor === "reprovado") return "reprovado";
  return item.offline ? "aprovado-offline" : "aprovado-online";
}

async function carregarMinisites() {
  try {
    const busca = document.getElementById("minisites-busca").value.trim();
    const params = new URLSearchParams({ pagina: String(minisitesPaginaAtual) });
    if (busca) params.set("busca", busca);

    const resposta = await fetch(`${API_BASE}/minisites?${params.toString()}`);
    if (!resposta.ok) throw new Error("Erro ao carregar minisites");

    const dados = await resposta.json();
    minisitesTotal = dados.total || 0;

    renderizarTabelaMinisites(dados.dados || []);

    document.getElementById("minisites-contador").textContent = `${minisitesTotal} registro(s)`;
    document.getElementById("minisites-pagina-label").textContent = `Página ${minisitesPaginaAtual}`;
    document.getElementById("minisites-anterior-btn").disabled = minisitesPaginaAtual <= 1;
    document.getElementById("minisites-proxima-btn").disabled = minisitesPaginaAtual * MINISITES_POR_PAGINA >= minisitesTotal;
  } catch (erro) {
    console.error("Erro ao carregar minisites:", erro);
  }
}

function renderizarTabelaMinisites(lista) {
  const tbody = document.getElementById("minisites-tbody");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-gray-600">Nenhum minisite encontrado</td></tr>`;
    return;
  }

  lista.forEach(item => {
    const statusKey = statusMinisiteDe(item);
    const status = STATUS_MINISITE_LABEL[statusKey];
    const criadoEm = item.criado_em ? new Date(item.criado_em).toLocaleDateString("pt-BR") : "-";

    const tr = document.createElement("tr");
    tr.className = "border-b last:border-0 hover:bg-gray-50";
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium text-slate-900">${item.nome_completo}</td>
      <td class="px-4 py-3 text-gray-700">${item.slug}</td>
      <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded ${status.classe}">${status.texto}</span></td>
      <td class="px-4 py-3 text-gray-700">${item.plano_nome || "-"}</td>
      <td class="px-4 py-3 text-gray-600">${criadoEm}</td>
      <td class="px-4 py-3">
        <div class="flex flex-wrap gap-2" data-acoes></div>
      </td>
    `;

    const acoes = tr.querySelector("[data-acoes]");

    if (statusKey === "pre-cadastro") {
      acoes.appendChild(criarBotaoAcao("Aprovar", "text-green-600 hover:text-green-800", () => abrirModalAprovarMinisite(item)));
    } else if (statusKey === "aprovado-online") {
      acoes.appendChild(criarBotaoAcao("Suspender", "text-orange-600 hover:text-orange-800", () => alternarStatusMinisite(item, true)));
    } else if (statusKey === "aprovado-offline") {
      acoes.appendChild(criarBotaoAcao("Reativar", "text-green-600 hover:text-green-800", () => alternarStatusMinisite(item, false)));
    }

    acoes.appendChild(criarBotaoAcao("Ver site", "text-blue-600 hover:text-blue-800", () => {
      window.open(`https://${item.slug}.imobiliarista.net`, "_blank", "noopener");
    }));

    acoes.appendChild(criarBotaoAcao("Editar", "text-gray-600 hover:text-gray-900", () => abrirModalEditarMinisite(item)));

    tbody.appendChild(tr);
  });
}

function criarBotaoAcao(texto, classes, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `text-xs font-semibold ${classes}`;
  btn.textContent = texto;
  btn.addEventListener("click", onClick);
  return btn;
}

async function alternarStatusMinisite(item, offline) {
  const acao = offline ? "suspender" : "reativar";
  if (!confirm(`Confirma ${acao} o minisite de "${item.nome_completo}" (${item.slug})?`)) return;

  try {
    const resposta = await fetch(`${API_BASE}/minisite/${item.corretor_id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offline })
    });

    if (!resposta.ok) throw new Error(`Erro ao ${acao}`);

    carregarMinisites();
  } catch (erro) {
    console.error(`Erro ao ${acao} minisite:`, erro);
    alert(`Erro ao ${acao} o minisite`);
  }
}

function abrirModalEditarMinisite(item) {
  minisiteEditarCorretorId = item.corretor_id;
  document.getElementById("minisite-editar-nome").value = item.nome_completo;
  document.getElementById("minisite-editar-slug").value = item.slug;
  document.getElementById("minisite-editar-modal").classList.remove("hidden");
}

function fecharModalEditarMinisite() {
  document.getElementById("minisite-editar-modal").classList.add("hidden");
  minisiteEditarCorretorId = null;
}

document.getElementById("minisite-editar-fechar-btn").addEventListener("click", fecharModalEditarMinisite);

document.getElementById("minisite-editar-salvar-btn").addEventListener("click", async () => {
  const nome = document.getElementById("minisite-editar-nome").value.trim();
  const slug = document.getElementById("minisite-editar-slug").value.trim();

  if (!nome || !slug) {
    alert("Preencha nome e slug");
    return;
  }

  try {
    const resposta = await fetch(`${API_BASE}/minisite/${minisiteEditarCorretorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, slug })
    });

    if (!resposta.ok) throw new Error("Erro ao atualizar");

    alert("✅ Dados atualizados com sucesso!");
    fecharModalEditarMinisite();
    carregarMinisites();
  } catch (erro) {
    console.error("Erro ao atualizar minisite:", erro);
    alert("Erro ao atualizar dados (slug pode já estar em uso)");
  }
});

function abrirModalAprovarMinisite(item) {
  minisiteAprovarPreCadastroId = item.pre_cadastro_id;
  document.getElementById("minisite-aprovar-slug").value = item.slug || "";
  document.getElementById("minisite-aprovar-modal").classList.remove("hidden");
}

function fecharModalAprovarMinisite() {
  document.getElementById("minisite-aprovar-modal").classList.add("hidden");
  minisiteAprovarPreCadastroId = null;
}

document.getElementById("minisite-aprovar-fechar-btn").addEventListener("click", fecharModalAprovarMinisite);

document.getElementById("minisite-aprovar-confirmar-btn").addEventListener("click", async () => {
  const slug = document.getElementById("minisite-aprovar-slug").value.trim();
  if (!slug) {
    alert("Digite o slug do minisite");
    return;
  }

  try {
    // Reaproveita a mesma rota/lógica de aprovação da fila de pré-cadastros
    // (POST /pre-cadastro/:id/aprovar → aprovarPreCadastro), sem duplicar.
    const resposta = await fetch(`${API_BASE}/pre-cadastro/${minisiteAprovarPreCadastroId}/aprovar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug_minisite: slug })
    });

    if (!resposta.ok) throw new Error("Erro ao aprovar");

    alert("✅ Minisite aprovado com sucesso!");
    fecharModalAprovarMinisite();
    carregarMinisites();
  } catch (erro) {
    console.error("Erro ao aprovar minisite:", erro);
    alert("Erro ao aprovar minisite");
  }
});

document.getElementById("minisites-busca").addEventListener("input", () => {
  clearTimeout(minisitesBuscaDebounce);
  minisitesBuscaDebounce = setTimeout(() => {
    minisitesPaginaAtual = 1;
    carregarMinisites();
  }, 300);
});

document.getElementById("minisites-anterior-btn").addEventListener("click", () => {
  if (minisitesPaginaAtual <= 1) return;
  minisitesPaginaAtual--;
  carregarMinisites();
});

document.getElementById("minisites-proxima-btn").addEventListener("click", () => {
  if (minisitesPaginaAtual * MINISITES_POR_PAGINA >= minisitesTotal) return;
  minisitesPaginaAtual++;
  carregarMinisites();
});

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
  document.getElementById("logout-btn").addEventListener("click", async () => {
    if (!confirm("Tem certeza que deseja sair?")) return;
    // session_id é HttpOnly — só o backend consegue revogar de verdade
    // (D1 + cookie).
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (erro) {
      console.error("Erro ao encerrar sessão:", erro);
    }
    window.location.href = "/login/";
  });
}
