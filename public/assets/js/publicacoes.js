// Renderização client-side do módulo Publicações (Lote 16, seção 4.19).
// Carregado só dentro das páginas /publicacoes e /publicacoes/{id}
// (geradas por src/modulos/publicacoes/rota.ts), que embutem o contexto
// necessário em window.__PUBLICACOES_CONTEXT__.
//
// 100% client-side por decisão de arquitetura (4.19): o fetch() abaixo
// vai direto no Blogspot (próprio do corretor ou Feed Padrão da Rede),
// nunca passa pelo D1/R2/Worker — o Worker só resolveu QUAL feed usar.

(function () {
  var MAX_RESULTADOS_LISTAGEM = 25;

  function escaparHtml(texto) {
    var div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
  }

  function normalizarBaseFeed(feedUrl) {
    return feedUrl.replace(/\/+$/, '').split('?')[0];
  }

  function extrairIdDoPost(idAtom) {
    var match = /\.post-(\d+)$/.exec(idAtom || '');
    return match ? match[1] : null;
  }

  function entradaParaPost(entrada) {
    var idAtom = entrada.id && entrada.id.$t;
    var id = extrairIdDoPost(idAtom);
    if (!id) return null;

    var linkAlternate = (entrada.link || []).filter(function (l) { return l.rel === 'alternate'; })[0];

    return {
      id: id,
      titulo: (entrada.title && entrada.title.$t) || 'Publicação',
      resumo: (entrada.summary && entrada.summary.$t) || '',
      conteudo: (entrada.content && entrada.content.$t) || '',
      dataPublicacao: (entrada.published && entrada.published.$t) || '',
      urlOriginal: linkAlternate ? linkAlternate.href : '',
    };
  }

  function formatarData(isoString) {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString('pt-BR');
    } catch (erro) {
      return '';
    }
  }

  async function buscarPostsDoFeed(feedUrl) {
    var base = normalizarBaseFeed(feedUrl);
    var url = base + '?alt=json&max-results=' + MAX_RESULTADOS_LISTAGEM;
    var resposta = await fetch(url);
    if (!resposta.ok) throw new Error('Feed indisponível');

    var dados = await resposta.json();
    var entradas = (dados.feed && dados.feed.entry) || [];
    return entradas.map(entradaParaPost).filter(Boolean);
  }

  async function buscarPostPorId(feedUrl, postId) {
    var base = normalizarBaseFeed(feedUrl);
    var url = base + '/' + postId + '?alt=json';
    var resposta = await fetch(url);
    if (!resposta.ok) throw new Error('Publicação não encontrada');

    var dados = await resposta.json();
    if (!dados.entry) throw new Error('Publicação não encontrada');
    return entradaParaPost(dados.entry);
  }

  function renderizarListagem(root, posts) {
    if (posts.length === 0) {
      root.innerHTML = '<p class="text-gray-600">Nenhuma publicação encontrada.</p>';
      return;
    }

    root.innerHTML =
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
      posts
        .map(function (post) {
          return (
            '<a href="/publicacoes/' + post.id + '" class="block bg-white rounded-lg card-shadow p-6 hover:shadow-lg transition">' +
            '<h2 class="text-lg font-bold text-slate-900 mb-2">' + escaparHtml(post.titulo) + '</h2>' +
            '<p class="text-sm text-gray-500 mb-3">' + escaparHtml(formatarData(post.dataPublicacao)) + '</p>' +
            '<p class="text-gray-700 line-clamp-3">' + escaparHtml(post.resumo.replace(/<[^>]+>/g, '')).slice(0, 200) + '</p>' +
            '</a>'
          );
        })
        .join('') +
      '</div>';
  }

  function renderizarPost(root, post) {
    document.title = post.titulo;

    root.innerHTML =
      '<article class="bg-white rounded-lg card-shadow p-8">' +
      '<h1 class="text-3xl font-bold text-slate-900 mb-2">' + escaparHtml(post.titulo) + '</h1>' +
      '<p class="text-sm text-gray-500 mb-6">' + escaparHtml(formatarData(post.dataPublicacao)) + '</p>' +
      '<div class="text-gray-800 leading-relaxed space-y-4">' + post.conteudo + '</div>' +
      '</article>';
  }

  function renderizarErro(root, mensagem) {
    root.innerHTML = '<p class="text-red-600">' + escaparHtml(mensagem) + '</p>';
  }

  async function inicializar() {
    var root = document.getElementById('publicacoes-root');
    var contexto = window.__PUBLICACOES_CONTEXT__;
    if (!root || !contexto) return;

    if (!navigator.onLine) {
      renderizarErro(root, 'Sem conexão — publicações não podem ser carregadas offline.');
      return;
    }

    try {
      if (contexto.modo === 'detalhe') {
        var post = await buscarPostPorId(contexto.feedUrl, contexto.postId);
        renderizarPost(root, post);
      } else {
        var posts = await buscarPostsDoFeed(contexto.feedUrl);
        renderizarListagem(root, posts);
      }
    } catch (erro) {
      console.error('Erro ao carregar Publicações:', erro);
      renderizarErro(root, 'Não foi possível carregar as publicações no momento.');
    }
  }

  document.addEventListener('DOMContentLoaded', inicializar);
})();
