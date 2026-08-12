// Endpoints de CRUD (criar, obter, editar, deletar) de anúncios
// POST/GET/PUT/DELETE /api/anuncios/*
// Conforme seção 6 e 4.11 do project.md
//
// ⚠️ EXCEÇÃO À REGRA DE 500 LINHAS (v1.0, seção 7)
// Este arquivo ultrapassa o alvo de ~500 linhas (549 linhas) porque é uma unidade coesa e única:
// CRUD de uma única entidade (Anúncio). Fragmentar em create.ts/update.ts/delete.ts separados
// geraria mais indireção que benefício. Mantém-se aqui por coesão funcional.

import { Env } from "../index";
import { Anuncio, Plano } from "../types/modelos";
import { gerarSlug } from "../lib/slug";
import { sanitizarBairroRegiao, sanitizarParaXML } from "../lib/sanitize";
import { getYouTubeId } from "../modulos/video-youtube/logica";
import { sanitizarTour360Url } from "../modulos/tour-360/rota";
import {
  criarAnuncio,
  buscarAnuncioPorId,
  contarAnunciosAtivosDoCorretor,
  atualizarAnuncio,
  togglePostarNaRede,
  marcarVendidoRemovido,
} from "../db/queries-anuncios";
import { dispararRevalidacaoCruzada } from "../jobs/revalidacao-cruzada";
import { obterCorretorAutenticado } from "../lib/sessao";

// ========== Auxiliares ==========

// Valida campos obrigatórios por tipo de imóvel quando portal externo está ativo
async function validarCamposObrigatorios(
  db: D1Database,
  tipo_imovel_id: number,
  dados: any,
  temPortalExterno: boolean
): Promise<string | null> {
  if (!temPortalExterno) return null;

  // Busca o tipo de imóvel para validação
  const tipoImovel = await db
    .prepare("SELECT slug FROM tipos_imovel WHERE id = ?")
    .bind(tipo_imovel_id)
    .first() as { slug: string } | undefined;

  if (!tipoImovel) return "Tipo de imóvel não encontrado";

  const slug = tipoImovel.slug;

  // Conforme seção 4.11: validação por tipo
  const terrenos = ["terreno", "lote", "area"];
  const rurais = ["fazenda", "sitio", "chacar"];
  const residenciais = ["apartamento", "casa", "cobertura"];

  if ([...terrenos, ...rurais].includes(slug)) {
    if (!dados.area_total) return "Área total é obrigatória para este tipo de imóvel";
  }

  if (!terrenos.includes(slug)) {
    if (!dados.area_util) return "Área útil é obrigatória para este tipo de imóvel";
  }

  if (residenciais.includes(slug)) {
    if (!dados.quartos && dados.quartos !== 0) return "Dormitórios é obrigatório para residenciais";
  }

  if (slug !== "terreno" && slug !== "lote" && slug !== "area") {
    if (!dados.banheiros && dados.banheiros !== 0) return "Banheiro é obrigatório";
  }

  return null;
}

// ========== Handlers de CRUD ==========

// POST /api/anuncios
// Cria novo anúncio
async function handleCriarAnuncio(request: Request, env: Env): Promise<Response> {
  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const dados = await request.json() as any;

    // Validação básica
    if (!dados.titulo?.trim()) {
      return new Response(JSON.stringify({ erro: "Título é obrigatório" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!dados.tipo_negocio_id || !dados.categoria_imovel_id || !dados.tipo_imovel_id || !dados.cidade_id) {
      return new Response(JSON.stringify({ erro: "Tipo de negócio, categoria, tipo de imóvel e cidade são obrigatórios" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Busca plano contratado do corretor (catálogo) para validar limites
    const plano = await env.DB.prepare(
      `SELECT p.* FROM planos p
       JOIN corretores c ON c.plano_id = p.id
       WHERE c.id = ?`
    )
      .bind(corretorId)
      .first() as Plano | undefined;

    if (!plano) {
      return new Response(JSON.stringify({ erro: "Plano do corretor não encontrado" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Valida limite de anúncios
    const contagemAtual = await contarAnunciosAtivosDoCorretor(env.DB, corretorId);
    if (contagemAtual >= plano.max_anuncios) {
      return new Response(JSON.stringify({
        erro: `Limite de anúncios atingido (${plano.max_anuncios})`,
      }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    // Valida limite de fotos
    const fotosArray = dados.fotos_json ? JSON.parse(dados.fotos_json) : [];
    if (fotosArray.length > plano.max_fotos_por_anuncio) {
      return new Response(JSON.stringify({
        erro: `Limite de fotos atingido (${plano.max_fotos_por_anuncio})`,
      }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    // Valida campos obrigatórios por portal externo
    const temPortalExterno = !!dados.portal_externo;
    const erroCamposObrigatorios = await validarCamposObrigatorios(
      env.DB,
      dados.tipo_imovel_id,
      dados,
      temPortalExterno
    );
    if (erroCamposObrigatorios) {
      return new Response(JSON.stringify({ erro: erroCamposObrigatorios }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Sanitiza campos
    const titulo = sanitizarParaXML(dados.titulo);
    const descricao = dados.descricao ? sanitizarParaXML(dados.descricao) : undefined;
    const bairro = dados.bairro ? sanitizarBairroRegiao(dados.bairro) : undefined;

    // Extrai YouTube ID se fornecido (módulo video-youtube, Lote 12.4)
    const videoYouTubeId = dados.video_youtube_url ? getYouTubeId(dados.video_youtube_url) : undefined;

    // Sanitiza URL do tour 360° se fornecido (módulo tour-360, Lote 12.5)
    const tour360Url = dados.tour_360_url ? sanitizarTour360Url(dados.tour_360_url) : undefined;

    // Gera slug temporário (será substituído após inserção com o ID real)
    let slug = gerarSlug(titulo, 0);

    // Cria anúncio (primeiro com slug temporário)
    const anuncioId = await criarAnuncio(env.DB, {
      corretor_id: corretorId,
      titulo,
      descricao,
      preco_venda: dados.preco_venda,
      preco_aluguel: dados.preco_aluguel,
      tipo_negocio_id: dados.tipo_negocio_id,
      categoria_imovel_id: dados.categoria_imovel_id,
      tipo_imovel_id: dados.tipo_imovel_id,
      cidade_id: dados.cidade_id,
      bairro,
      endereco_completo: dados.endereco_completo,
      exibir_endereco_completo: dados.exibir_endereco_completo || false,
      area_total: dados.area_total,
      area_util: dados.area_util,
      quartos: dados.quartos,
      banheiros: dados.banheiros,
      vagas_garagem: dados.vagas_garagem,
      cozinhas: dados.cozinhas,
      lavanderias: dados.lavanderias,
      fotos_json: dados.fotos_json,
      video_youtube_id: videoYouTubeId,
      tour_360_url: tour360Url || undefined,
      slug: slug, // Slug provisório
    });

    // Atualiza slug com o ID real
    slug = gerarSlug(titulo, anuncioId);
    await atualizarAnuncio(env.DB, anuncioId, { slug } as any);

    // Enfileirar regeneração de JSON (Lote 6)
    try {
      const minisite = await env.DB
        .prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1")
        .bind(corretorId)
        .first() as { slug: string } | undefined;
      const cidade = await env.DB
        .prepare("SELECT nome FROM cidades WHERE id = ? LIMIT 1")
        .bind(dados.cidade_id)
        .first() as { nome: string } | undefined;

      if (minisite && cidade) {
        const cidadeSlug = cidade.nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        await dispararRevalidacaoCruzada(
          env.FILA_ALTERACOES,
          anuncioId,
          minisite.slug,
          dados.cidade_id,
          cidadeSlug,
        );
      }
    } catch (erroFila) {
      console.warn("Aviso: falha ao enfileirar revalidação:", erroFila);
    }

    const anuncio = await buscarAnuncioPorId(env.DB, anuncioId);

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Anúncio criado com sucesso",
      anuncio,
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro ao criar anúncio:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao processar anúncio" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// GET /api/anuncios/:id
// Obtém detalhe de um anúncio
async function handleObterAnuncio(request: Request, env: Env): Promise<Response> {
  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const id = parseInt(url.pathname.split("/").pop() || "0");

    if (!id) {
      return new Response(JSON.stringify({ erro: "ID inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const anuncio = await buscarAnuncioPorId(env.DB, id);

    if (!anuncio) {
      return new Response(JSON.stringify({ erro: "Anúncio não encontrado" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Valida se o corretor é o dono (conforme seção 6)
    if (anuncio.corretor_id !== corretorId) {
      return new Response(JSON.stringify({ erro: "Acesso negado" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      sucesso: true,
      anuncio,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro ao obter anúncio:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao obter anúncio" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// PUT /api/anuncios/:id
// Edita anúncio
async function handleEditarAnuncio(request: Request, env: Env): Promise<Response> {
  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const id = parseInt(url.pathname.split("/").pop() || "0");

    if (!id) {
      return new Response(JSON.stringify({ erro: "ID inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Valida propriedade
    const anuncio = await buscarAnuncioPorId(env.DB, id);
    if (!anuncio || anuncio.corretor_id !== corretorId) {
      return new Response(JSON.stringify({ erro: "Acesso negado" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const dados = await request.json() as any;

    // Sanitiza campos editáveis
    const atualizacoes: Partial<Anuncio> = {};

    if (dados.titulo) atualizacoes.titulo = sanitizarParaXML(dados.titulo);
    if (dados.descricao !== undefined) atualizacoes.descricao = dados.descricao ? sanitizarParaXML(dados.descricao) : "";
    if (dados.preco_venda !== undefined) atualizacoes.preco_venda = dados.preco_venda;
    if (dados.preco_aluguel !== undefined) atualizacoes.preco_aluguel = dados.preco_aluguel;
    if (dados.bairro !== undefined) atualizacoes.bairro = dados.bairro ? sanitizarBairroRegiao(dados.bairro) : "";
    if (dados.endereco_completo !== undefined) atualizacoes.endereco_completo = dados.endereco_completo;
    if (dados.exibir_endereco_completo !== undefined) atualizacoes.exibir_endereco_completo = dados.exibir_endereco_completo;
    if (dados.area_total !== undefined) atualizacoes.area_total = dados.area_total;
    if (dados.area_util !== undefined) atualizacoes.area_util = dados.area_util;
    if (dados.quartos !== undefined) atualizacoes.quartos = dados.quartos;
    if (dados.banheiros !== undefined) atualizacoes.banheiros = dados.banheiros;
    if (dados.vagas_garagem !== undefined) atualizacoes.vagas_garagem = dados.vagas_garagem;
    if (dados.cozinhas !== undefined) atualizacoes.cozinhas = dados.cozinhas;
    if (dados.lavanderias !== undefined) atualizacoes.lavanderias = dados.lavanderias;
    if (dados.fotos_json !== undefined) atualizacoes.fotos_json = dados.fotos_json;
    if (dados.tour_360_url !== undefined) {
      const tour360Sanitizado = dados.tour_360_url ? sanitizarTour360Url(dados.tour_360_url) : "";
      atualizacoes.tour_360_url = tour360Sanitizado || "";
    }

    if (dados.video_youtube_url) {
      atualizacoes.video_youtube_id = getYouTubeId(dados.video_youtube_url) || undefined;
    }

    // Toggle "postar na rede" dispara revalidação cruzada
    if (dados.postar_na_rede !== undefined && dados.postar_na_rede !== anuncio.postar_na_rede) {
      await togglePostarNaRede(env.DB, id, dados.postar_na_rede);
      // Enfileirar revalidação cruzada (Lote 6)
      try {
        const minisite = await env.DB
          .prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1")
          .bind(anuncio.corretor_id)
          .first() as { slug: string } | undefined;
        const cidade = await env.DB
          .prepare("SELECT nome FROM cidades WHERE id = ? LIMIT 1")
          .bind(anuncio.cidade_id)
          .first() as { nome: string } | undefined;

        if (minisite && cidade) {
          const cidadeSlug = cidade.nome
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          await dispararRevalidacaoCruzada(
            env.FILA_ALTERACOES,
            id,
            minisite.slug,
            anuncio.cidade_id,
            cidadeSlug,
          );
        }
      } catch (erroFila) {
        console.warn("Aviso: falha ao enfileirar revalidação:", erroFila);
      }
    } else if (dados.postar_na_rede !== undefined) {
      atualizacoes.postar_na_rede = dados.postar_na_rede;
    }

    // Marca como vendido/removido
    if (dados.marcar_vendido) {
      await marcarVendidoRemovido(env.DB, id);
      // Enfileirar revalidação cruzada (Lote 6)
      try {
        const minisite = await env.DB
          .prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1")
          .bind(anuncio.corretor_id)
          .first() as { slug: string } | undefined;
        const cidade = await env.DB
          .prepare("SELECT nome FROM cidades WHERE id = ? LIMIT 1")
          .bind(anuncio.cidade_id)
          .first() as { nome: string } | undefined;

        if (minisite && cidade) {
          const cidadeSlug = cidade.nome
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-");
          await dispararRevalidacaoCruzada(
            env.FILA_ALTERACOES,
            id,
            minisite.slug,
            anuncio.cidade_id,
            cidadeSlug,
          );
        }
      } catch (erroFila) {
        console.warn("Aviso: falha ao enfileirar revalidação:", erroFila);
      }
    } else {
      await atualizarAnuncio(env.DB, id, atualizacoes);
    }

    const anuncioAtualizado = await buscarAnuncioPorId(env.DB, id);

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Anúncio atualizado com sucesso",
      anuncio: anuncioAtualizado,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro ao editar anúncio:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao editar anúncio" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// DELETE /api/anuncios/:id
// Marca como vendido/removido (não deleta fisicamente)
async function handleDeletarAnuncio(request: Request, env: Env): Promise<Response> {
  try {
    const corretorId = await obterCorretorAutenticado(request, env);
    if (!corretorId) {
      return new Response(JSON.stringify({ erro: "Não autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const id = parseInt(url.pathname.split("/").pop() || "0");

    if (!id) {
      return new Response(JSON.stringify({ erro: "ID inválido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const anuncio = await buscarAnuncioPorId(env.DB, id);
    if (!anuncio || anuncio.corretor_id !== corretorId) {
      return new Response(JSON.stringify({ erro: "Acesso negado" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    // Marca como vendido/removido (conforme seção 4.17)
    await marcarVendidoRemovido(env.DB, id);

    // Enfileirar revalidação cruzada (Lote 6)
    try {
      const minisite = await env.DB
        .prepare("SELECT slug FROM minisites WHERE corretor_id = ? LIMIT 1")
        .bind(anuncio.corretor_id)
        .first() as { slug: string } | undefined;
      const cidade = await env.DB
        .prepare("SELECT nome FROM cidades WHERE id = ? LIMIT 1")
        .bind(anuncio.cidade_id)
        .first() as { nome: string } | undefined;

      if (minisite && cidade) {
        const cidadeSlug = cidade.nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        await dispararRevalidacaoCruzada(
          env.FILA_ALTERACOES,
          id,
          minisite.slug,
          anuncio.cidade_id,
          cidadeSlug,
        );
      }
    } catch (erroFila) {
      console.warn("Aviso: falha ao enfileirar revalidação:", erroFila);
    }

    return new Response(JSON.stringify({
      sucesso: true,
      mensagem: "Anúncio marcado como vendido/removido",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (erro) {
    console.error("Erro ao deletar anúncio:", erro);
    return new Response(JSON.stringify({ erro: "Erro ao deletar anúncio" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// ========== Roteador para rotas de CRUD ==========

export async function rotasAnunciosCrud(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const metodo = request.method;
  const caminho = url.pathname;

  if (metodo === "POST" && caminho === "/api/anuncios") {
    return handleCriarAnuncio(request, env);
  }

  if (metodo === "GET" && caminho.match(/^\/api\/anuncios\/\d+$/)) {
    return handleObterAnuncio(request, env);
  }

  if (metodo === "PUT" && caminho.match(/^\/api\/anuncios\/\d+$/)) {
    return handleEditarAnuncio(request, env);
  }

  if (metodo === "DELETE" && caminho.match(/^\/api\/anuncios\/\d+$/)) {
    return handleDeletarAnuncio(request, env);
  }

  return new Response(JSON.stringify({ erro: "Rota não encontrada" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}
