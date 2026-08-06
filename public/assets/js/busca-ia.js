// Módulo de Busca por IA — assistente de busca em linguagem natural
// Lote 12.3 do Roadmap — Seção 4.12 do project.md
// Aplica filtros retornados pela IA sobre o JSON já carregado

class BuscaIA {
  constructor() {
    this.inputElement = null;
    this.botaoElement = null;
    this.indicadorCarregamento = null;
    this.ultimaFrase = "";
  }

  // Inicializa o componente (chamado após DOMContentLoaded)
  inicializar() {
    this.inputElement = document.getElementById("busca-ia-input");
    this.botaoElement = document.getElementById("busca-ia-botao");

    if (!this.inputElement || !this.botaoElement) {
      console.warn("Elementos de busca por IA não encontrados no DOM");
      return;
    }

    // Event listeners
    this.inputElement.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.executarBusca();
      }
    });

    this.botaoElement.addEventListener("click", () => {
      this.executarBusca();
    });
  }

  // Executa a busca na IA
  async executarBusca() {
    const frase = this.inputElement.value.trim();

    if (!frase || frase.length < 3) {
      alert("Digite uma busca com pelo menos 3 caracteres");
      return;
    }

    this.ultimaFrase = frase;
    this.mostrarCarregamento(true);

    try {
      const resposta = await fetch("/api/busca-ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ frase }),
      });

      if (!resposta.ok) {
        const erro = await resposta.json();
        throw new Error(erro.erro || `Erro HTTP ${resposta.status}`);
      }

      const filtros = await resposta.json();

      // Aplicar os filtros ao formulário
      this.aplicarFiltros(filtros);

      // Executar a busca com os filtros
      if (typeof applyFilters === "function") {
        applyFilters();
      }
      if (typeof renderListings === "function") {
        renderListings();
      }

      // Feedback visual
      this.mostrarSucesso(filtros);
    } catch (erro) {
      console.error("Erro na busca por IA:", erro);
      alert(`Erro ao interpretar sua busca: ${erro.message}`);
    } finally {
      this.mostrarCarregamento(false);
    }
  }

  // Aplica os filtros retornados pela IA aos elementos do formulário
  aplicarFiltros(filtros) {
    // Tipo de negócio (Venda/Locação)
    if (filtros.tipoNegocio) {
      const radioButton = document.querySelector(
        `input[name="business-type"][value="${filtros.tipoNegocio}"]`
      );
      if (radioButton) {
        radioButton.checked = true;
      }
    }

    // Categoria (Residencial, Comercial, etc.)
    if (filtros.categoria) {
      const selectCategoria = document.getElementById("filter-category");
      if (selectCategoria) {
        selectCategoria.value = filtros.categoria;
      }
    }

    // Tipo de Imóvel (Apartamento, Casa, etc.) — se houver campo específico
    if (filtros.tipoImovel) {
      const selectTipo = document.getElementById("filter-tipo-imovel");
      if (selectTipo) {
        selectTipo.value = filtros.tipoImovel;
      }
    }

    // Preço máximo
    if (filtros.precoMax) {
      const inputPreco = document.getElementById("filter-max-price");
      if (inputPreco) {
        inputPreco.value = filtros.precoMax;
      }
    }

    // Quartos
    if (filtros.quartos) {
      const inputQuartos = document.getElementById("filter-bedrooms");
      if (inputQuartos) {
        inputQuartos.value = filtros.quartos;
      }
    }

    // Banheiros
    if (filtros.banheiros) {
      const inputBanheiros = document.getElementById("filter-bathrooms");
      if (inputBanheiros) {
        inputBanheiros.value = filtros.banheiros;
      }
    }

    // Vagas de garagem
    if (filtros.vagas_garagem) {
      const inputVagas = document.getElementById("filter-parking");
      if (inputVagas) {
        inputVagas.value = filtros.vagas_garagem;
      }
    }

    // Área mínima
    if (filtros.area_util || filtros.area_total) {
      const area = filtros.area_util || filtros.area_total;
      const inputArea = document.getElementById("filter-min-area");
      if (inputArea) {
        inputArea.value = area;
      }
    }

    // Região/Bairro
    if (filtros.bairro) {
      const selectBairro = document.getElementById("filter-region");
      if (selectBairro) {
        selectBairro.value = filtros.bairro;
      }
    }

    // Cidade (se houver seletor de cidade na home)
    if (filtros.cidade) {
      const inputCidade = document.getElementById("city-search");
      if (inputCidade) {
        inputCidade.value = filtros.cidade;
        // Navegar para a cidade se existir função de navegação
        if (typeof navigateToCity === "function") {
          navigateToCity(filtros.cidade.toLowerCase());
        }
      }
    }

    // Campos opcionais: salas, cozinhas, lavanderias
    // Estes podem não ter elementos no formulário base, mas deixar preparado se forem adicionados
    if (filtros.salas) {
      const inputSalas = document.getElementById("filter-salas");
      if (inputSalas) {
        inputSalas.value = filtros.salas;
      }
    }

    if (filtros.cozinhas) {
      const inputCozinhas = document.getElementById("filter-cozinhas");
      if (inputCozinhas) {
        inputCozinhas.value = filtros.cozinhas;
      }
    }

    if (filtros.lavanderias) {
      const inputLavanderias = document.getElementById("filter-lavanderias");
      if (inputLavanderias) {
        inputLavanderias.value = filtros.lavanderias;
      }
    }
  }

  // Mostra/oculta indicador de carregamento
  mostrarCarregamento(sim) {
    if (this.botaoElement) {
      if (sim) {
        this.botaoElement.disabled = true;
        this.botaoElement.innerHTML =
          '<span class="animate-spin">⏳</span> Processando...';
      } else {
        this.botaoElement.disabled = false;
        this.botaoElement.innerHTML = "🔍 Buscar";
      }
    }
  }

  // Mostra feedback de sucesso com resumo dos filtros aplicados
  mostrarSucesso(filtros) {
    const mensagens = [];

    if (filtros.cidade) mensagens.push(`📍 ${filtros.cidade}`);
    if (filtros.tipoNegocio) {
      const tipo =
        filtros.tipoNegocio === "venda" ? "Venda" : "Locação";
      mensagens.push(tipo);
    }
    if (filtros.tipoImovel) mensagens.push(filtros.tipoImovel);
    if (filtros.quartos) mensagens.push(`${filtros.quartos} quartos`);
    if (filtros.precoMax)
      mensagens.push(`até R$ ${filtros.precoMax.toLocaleString("pt-BR")}`);

    if (mensagens.length > 0) {
      console.log("✓ Filtros aplicados:", mensagens.join(" • "));
    }
  }

  // Limpa a busca e os filtros
  limpar() {
    if (this.inputElement) {
      this.inputElement.value = "";
    }
    if (typeof clearAllFilters === "function") {
      clearAllFilters();
    }
  }
}

// Instância global
const buscaIA = new BuscaIA();

// Inicializa quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  buscaIA.inicializar();
});
