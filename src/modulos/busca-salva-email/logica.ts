// Lógica de correspondência: novo anúncio × buscas salvas → dispara e-mail
// Seção 2.1 e 4.4.1 do project.md
// Integrado aos jobs de gerar-json-cidade.ts para rodar quando há novo anúncio

import { Anuncio } from "../../types/modelos";
import {
  obterBuscasAtivas,
  verificarJaNotificado,
  adicionarNotificacaoEnviada,
  BuscaSalva,
} from "../../db/queries-buscas-salvas";
import { estaModuloAtivo } from "../../db/queries-modulos";

export interface Criterios {
  cidade?: string;
  tipo_negocio?: string;
  categoria?: string;
  tipo_imovel?: string;
  preco_min?: number;
  preco_max?: number;
  quartos?: number;
  banheiros?: number;
  area_min?: number;
  area_max?: number;
  [key: string]: any;
}

function anuncioAtendeCriterios(anuncio: Anuncio, criterios: Criterios): boolean {
  // Cidade (obrigatória para correspondência)
  if (criterios.cidade) {
    const cidadeAnuncioId = anuncio.cidade_id.toString();
    if (cidadeAnuncioId !== criterios.cidade) {
      return false;
    }
  }

  // Tipo de negócio (venda/locação)
  if (criterios.tipo_negocio) {
    const tipoAnuncio = anuncio.preco_aluguel ? "locacao" : "venda";
    if (tipoAnuncio !== criterios.tipo_negocio) {
      return false;
    }
  }

  // Faixa de preço
  const preco = anuncio.preco_venda || anuncio.preco_aluguel || 0;
  if (criterios.preco_min && preco < criterios.preco_min) {
    return false;
  }
  if (criterios.preco_max && preco > criterios.preco_max) {
    return false;
  }

  // Quartos
  if (criterios.quartos && anuncio.quartos && anuncio.quartos < criterios.quartos) {
    return false;
  }

  // Banheiros
  if (criterios.banheiros && anuncio.banheiros && anuncio.banheiros < criterios.banheiros) {
    return false;
  }

  // Área útil (m²)
  if (criterios.area_min && anuncio.area_util && anuncio.area_util < criterios.area_min) {
    return false;
  }
  if (criterios.area_max && anuncio.area_util && anuncio.area_util > criterios.area_max) {
    return false;
  }

  // Todos os critérios atendidos
  return true;
}

interface EmailADispatcher {
  email: string;
  buscaSalvaId: number;
  anuncioId: number;
  criterios: Criterios;
  anuncio: Anuncio;
  tokenCancelamento: string;
}

export async function encontrarBuscasCorrespondentes(
  db: D1Database,
  anuncio: Anuncio
): Promise<EmailADispatcher[]> {
  // Verifica se o módulo está ativo
  const moduloAtivo = await estaModuloAtivo(db, "busca-salva-email");
  if (!moduloAtivo) {
    return [];
  }

  try {
    const buscasAtivas = await obterBuscasAtivas(db);
    const emailsADispatcher: EmailADispatcher[] = [];

    for (const busca of buscasAtivas) {
      // Verifica se já foi notificado sobre este anúncio
      const jaNotificado = await verificarJaNotificado(busca, anuncio.id);
      if (jaNotificado) {
        continue;
      }

      // Parse dos critérios
      let criterios: Criterios;
      try {
        criterios = JSON.parse(busca.criterios);
      } catch {
        console.error(`Critérios inválidos na busca ${busca.id}`);
        continue;
      }

      // Verifica correspondência
      if (anuncioAtendeCriterios(anuncio, criterios)) {
        emailsADispatcher.push({
          email: busca.email,
          buscaSalvaId: busca.id,
          anuncioId: anuncio.id,
          criterios,
          anuncio,
          tokenCancelamento: busca.token_cancelamento,
        });
      }
    }

    return emailsADispatcher;
  } catch (erro) {
    console.error("Erro ao encontrar buscas correspondentes:", erro);
    return [];
  }
}

export async function dispararEmails(
  emails: EmailADispatcher[],
  db: D1Database,
  resendToken: string
): Promise<void> {
  if (emails.length === 0) {
    return;
  }

  // Reutiliza a configuração de e-mail já usada em api-auth.ts (Resend)
  // Não duplica setup do Resend — usa o mesmo binding/token

  for (const disparo of emails) {
    try {
      const corpoEmail = gerarCorpoEmail(disparo);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendToken}`,
        },
        body: JSON.stringify({
          from: "noreply@imobiliarista.net",
          to: disparo.email,
          subject: `Novo imóvel encontrado em sua busca salva! 🏠`,
          html: corpoEmail,
        }),
      });

      if (response.ok) {
        // Marca como notificado no banco
        await adicionarNotificacaoEnviada(db, disparo.buscaSalvaId, disparo.anuncioId);
        console.log(`E-mail enviado para ${disparo.email} sobre anúncio ${disparo.anuncioId}`);
      } else {
        console.error(
          `Erro ao enviar e-mail para ${disparo.email}:`,
          await response.text()
        );
      }
    } catch (erro) {
      console.error(`Erro ao disparar e-mail para ${disparo.email}:`, erro);
    }
  }
}

function gerarCorpoEmail(disparo: EmailADispatcher): string {
  const anuncio = disparo.anuncio;
  const preco = anuncio.preco_venda || anuncio.preco_aluguel || 0;
  const precoFormatado = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(preco);

  const specs = [
    anuncio.quartos ? `${anuncio.quartos} quartos` : null,
    anuncio.banheiros ? `${anuncio.banheiros} banheiros` : null,
    anuncio.area_util ? `${anuncio.area_util}m²` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const linkAnuncio = `https://imobiliarista.net/${disparo.criterios.cidade}/${disparo.criterios.tipo_negocio}/${disparo.criterios.tipo_imovel}/${anuncio.slug}`;
  const linkCancelar = `https://imobiliarista.net/api/busca-salva/cancelar/${disparo.tokenCancelamento}`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Encontramos um imóvel para você! 🎉</h2>
      <p>Um novo imóvel foi publicado que corresponde aos critérios da sua busca salva.</p>

      <div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0;">${anuncio.titulo}</h3>
        <p style="color: #666; margin: 0 0 12px 0;">
          <strong>${precoFormatado}</strong> ${specs ? "• " + specs : ""}
        </p>
        <p style="color: #999; margin: 0; font-size: 14px;">
          ${anuncio.bairro ? anuncio.bairro + " • " : ""}${anuncio.descricao?.substring(0, 100) || ""}
        </p>
      </div>

      <p style="margin: 20px 0;">
        <a href="${linkAnuncio}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          Ver Imóvel
        </a>
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="color: #999; font-size: 12px; margin: 10px 0;">
        Não quer mais receber notificações dessa busca?
        <a href="${linkCancelar}" style="color: #007bff; text-decoration: none;">
          Cancelar busca salva
        </a>
      </p>

      <p style="color: #999; font-size: 11px; margin: 5px 0;">
        Portal Imobiliário — Rede de Corretores
      </p>
    </div>
  `;
}
