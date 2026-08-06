// Lógica de interpretação de busca em linguagem natural via Cloudflare Workers AI
// Seção 4.12 do project.md

// Taxonomia fixa da plataforma (deve bater com seção 5.3 do project.md)
const TIPOS_NEGOCIO = ["venda", "locacao"];

const CATEGORIAS_TIPOS: Record<string, string[]> = {
  residencial: [
    "apartamento",
    "area",
    "casa",
    "chacara",
    "cobertura",
    "terreno",
  ],
  comercial: ["area", "barracap", "casa", "galpao", "loja", "predio", "sala", "salao", "terreno"],
  corporativo: ["area", "barracap", "casa", "galpao", "loja", "predio", "sala", "salao", "terreno"],
  industrial: ["area", "barracap", "galpao", "salao", "terreno"],
  rural: ["area", "casa", "chacara", "fazenda", "sitio", "terreno"],
};

export interface FiltrosBuscaIA {
  cidade?: string; // Nome da cidade (ex: "Londrina")
  tipoNegocio?: string; // "venda" ou "locacao"
  categoria?: string; // "residencial", "comercial", etc.
  tipoImovel?: string; // "apartamento", "casa", etc.
  precoMax?: number; // Faixa de preço máxima
  quartos?: number; // Número de quartos
  banheiros?: number; // Número de banheiros
  vagas_garagem?: number;
  area_util?: number;
  area_total?: number;
  bairro?: string;
  salas?: number;
  cozinhas?: number;
  lavanderias?: number;
  confianca?: number; // 0-100: confiança da interpretação
}

// Valida e normaliza um tipo de negócio
function validarTipoNegocio(valor?: string): string | undefined {
  if (!valor) return undefined;
  const normalizado = valor.toLowerCase().trim();
  if (TIPOS_NEGOCIO.includes(normalizado)) {
    return normalizado;
  }
  // Tolerância: "aluguel" → "locacao"
  if (normalizado.includes("aluguel") || normalizado.includes("aluga")) {
    return "locacao";
  }
  if (normalizado.includes("vend")) {
    return "venda";
  }
  return undefined;
}

// Valida e normaliza uma categoria
function validarCategoria(valor?: string): string | undefined {
  if (!valor) return undefined;
  const normalizado = valor.toLowerCase().trim();
  const chaves = Object.keys(CATEGORIAS_TIPOS);
  if (chaves.includes(normalizado)) {
    return normalizado;
  }
  // Busca parcial por similaridade
  for (const chave of chaves) {
    if (normalizado.includes(chave) || chave.includes(normalizado)) {
      return chave;
    }
  }
  return undefined;
}

// Valida e normaliza um tipo de imóvel contra a categoria
function validarTipoImovel(valor?: string, categoria?: string): string | undefined {
  if (!valor) return undefined;
  const normalizado = valor.toLowerCase().trim();

  // Se categoria foi identificada, valida contra seus tipos
  if (categoria && CATEGORIAS_TIPOS[categoria]) {
    const tipos = CATEGORIAS_TIPOS[categoria];
    if (tipos.includes(normalizado)) {
      return normalizado;
    }
    // Busca parcial
    for (const tipo of tipos) {
      if (normalizado.includes(tipo) || tipo.includes(normalizado)) {
        return tipo;
      }
    }
  }

  // Sem categoria, procura em todas
  for (const tipos of Object.values(CATEGORIAS_TIPOS)) {
    if (tipos.includes(normalizado)) {
      return normalizado;
    }
    for (const tipo of tipos) {
      if (normalizado.includes(tipo) || tipo.includes(normalizado)) {
        return tipo;
      }
    }
  }

  return undefined;
}

// Extrai número de uma string (ex: "R$ 400 mil" → 400000, "2 quartos" → 2)
function extrairNumero(texto?: string): number | undefined {
  if (!texto) return undefined;

  const str = String(texto).toLowerCase().trim();

  // Detecta "mil", "milhão", "bilhão"
  if (str.includes("mil") && !str.includes("milh")) {
    const match = str.match(/(\d+(?:[.,]\d+)?)\s*mil/i);
    if (match) {
      const num = parseFloat(match[1].replace(",", "."));
      return num * 1000;
    }
  }

  if (str.includes("milh")) {
    const match = str.match(/(\d+(?:[.,]\d+)?)\s*milh/i);
    if (match) {
      const num = parseFloat(match[1].replace(",", "."));
      return num * 1000000;
    }
  }

  if (str.includes("bilh")) {
    const match = str.match(/(\d+(?:[.,]\d+)?)\s*bilh/i);
    if (match) {
      const num = parseFloat(match[1].replace(",", "."));
      return num * 1000000000;
    }
  }

  // Sem multiplicador, tenta extrair número simples
  const match = str.match(/\d+(?:[.,]\d+)?/);
  if (match) {
    return parseFloat(match[0].replace(",", "."));
  }

  return undefined;
}

// Constrói o prompt para o modelo de IA
function construirPrompt(frase: string): string {
  return `Você é um assistente de busca imobiliária. Analise a frase do usuário e extraia os filtros estruturados em JSON.

TAXONOMIA (deve respeitar exatamente):
- Tipo de Negócio: venda, locacao
- Categorias: residencial, comercial, corporativo, industrial, rural
- Tipos de Imóvel por Categoria:
  - Residencial: apartamento, area, casa, chacara, cobertura, terreno
  - Comercial: area, barracap, casa, galpao, loja, predio, sala, salao, terreno
  - Corporativo: area, barracap, casa, galpao, loja, predio, sala, salao, terreno
  - Industrial: area, barracap, galpao, salao, terreno
  - Rural: area, casa, chacara, fazenda, sitio, terreno

Frase do usuário: "${frase}"

Retorne um JSON (e APENAS o JSON, sem explicações adicionais) com a estrutura abaixo. Se um campo não foi mencionado ou não pôde ser extraído, omita a chave no JSON. Sempre inclua "confianca" (0-100) indicando o quão bem você entendeu a busca:

{
  "cidade": "nome da cidade",
  "tipoNegocio": "venda ou locacao",
  "categoria": "residencial, comercial, etc",
  "tipoImovel": "apartamento, casa, etc",
  "precoMax": número (preço máximo em reais),
  "quartos": número,
  "banheiros": número,
  "vagas_garagem": número,
  "area_util": número (em m²),
  "area_total": número (em m²),
  "bairro": "nome do bairro",
  "salas": número,
  "cozinhas": número,
  "lavanderias": número,
  "confianca": 0-100
}`;
}

// Interpreta a resposta do modelo e valida contra taxonomia
export async function interpretarBuscaIA(
  frase: string,
  resposta: string
): Promise<FiltrosBuscaIA | null> {
  try {
    // Tenta extrair JSON da resposta
    // O modelo deve retornar apenas JSON, mas por segurança procuramos pelo JSON
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("Nenhum JSON encontrado na resposta da IA");
      return null;
    }

    const dados = JSON.parse(jsonMatch[0]);

    // Valida e normaliza cada campo
    const filtros: FiltrosBuscaIA = {
      confianca: Math.min(100, Math.max(0, dados.confianca || 50)),
    };

    // Cidade: apenas normaliza (não há taxonomia fixa de cidades)
    if (dados.cidade) {
      filtros.cidade = String(dados.cidade).trim();
    }

    // Tipo de negócio: valida
    const tipoValidado = validarTipoNegocio(dados.tipoNegocio);
    if (tipoValidado) {
      filtros.tipoNegocio = tipoValidado;
    }

    // Categoria: valida
    const categoriaValidada = validarCategoria(dados.categoria);
    if (categoriaValidada) {
      filtros.categoria = categoriaValidada;
    }

    // Tipo de imóvel: valida contra categoria (se disponível)
    const tipoImovelValidado = validarTipoImovel(dados.tipoImovel, filtros.categoria);
    if (tipoImovelValidado) {
      filtros.tipoImovel = tipoImovelValidado;
    }

    // Preço máximo: extrai número
    if (dados.precoMax !== undefined) {
      const preco = extrairNumero(String(dados.precoMax));
      if (preco && preco > 0) {
        filtros.precoMax = Math.round(preco);
      }
    }

    // Números: quartos, banheiros, vagas, salas, cozinhas, lavanderias
    for (const campo of [
      "quartos",
      "banheiros",
      "vagas_garagem",
      "salas",
      "cozinhas",
      "lavanderias",
    ]) {
      if (dados[campo] !== undefined) {
        const num = extrairNumero(String(dados[campo]));
        if (num && num > 0 && num < 100) {
          filtros[campo as keyof FiltrosBuscaIA] = Math.round(num) as any;
        }
      }
    }

    // Áreas: utíl e total
    if (dados.area_util !== undefined) {
      const area = extrairNumero(String(dados.area_util));
      if (area && area > 0) {
        filtros.area_util = Math.round(area);
      }
    }

    if (dados.area_total !== undefined) {
      const area = extrairNumero(String(dados.area_total));
      if (area && area > 0) {
        filtros.area_total = Math.round(area);
      }
    }

    // Bairro: apenas normaliza
    if (dados.bairro) {
      filtros.bairro = String(dados.bairro).trim();
    }

    return filtros;
  } catch (erro) {
    console.error("Erro ao interpretar resposta da IA:", erro);
    return null;
  }
}

// Função principal: chama a IA e processa a resposta
export async function buscarComIA(
  frase: string,
  ai: any
): Promise<FiltrosBuscaIA | null> {
  try {
    const prompt = construirPrompt(frase);

    // Chama o modelo via Cloudflare Workers AI
    // Usando @cf/mistral/mistral-7b-instruct-v0.1 (rápido, bom custo de Neurons)
    const resposta = await ai.run("@cf/mistral/mistral-7b-instruct-v0.1", {
      prompt,
      max_tokens: 512,
      temperature: 0.3, // Mais determinístico, menos criativo
    });

    if (!resposta || !resposta.response) {
      console.warn("Resposta vazia ou inválida da IA");
      return null;
    }

    const filtros = await interpretarBuscaIA(frase, resposta.response);
    return filtros;
  } catch (erro) {
    console.error("Erro ao chamar IA:", erro);
    return null;
  }
}
