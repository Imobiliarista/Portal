// Lógica de agendamento de visita — envio de e-mails via Resend (Lote 12.7)
// Ao criar: notifica corretor; ao confirmar/recusar: notifica visitante
// Reutiliza setup do Resend do Lote 3

import { AgendamentoVisita } from "../../types/modelos";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = "agendamentos@imobiliarista.net";

interface EmailNotificacao {
  para: string;
  assunto: string;
  corpo: string;
}

export async function enviarEmailNotificacaoAoCorretor(
  agendamento: AgendamentoVisita,
  tituloAnuncio: string,
  endereco: string,
  nomeCorretor: string
): Promise<boolean> {
  const email: EmailNotificacao = {
    para: "", // Será preenchido pela query
    assunto: `Nova solicitação de visita: ${tituloAnuncio}`,
    corpo: gerarCorpoEmailNotificacaoCorretor(
      agendamento,
      tituloAnuncio,
      endereco,
      nomeCorretor
    ),
  };

  return await enviarEmail(email);
}

export async function enviarEmailConfirmacaoVisitante(
  agendamento: AgendamentoVisita,
  tituloAnuncio: string,
  nomeCorretor: string
): Promise<boolean> {
  const email: EmailNotificacao = {
    para: agendamento.email_visitante,
    assunto: `Sua visita foi confirmada: ${tituloAnuncio}`,
    corpo: gerarCorpoEmailConfirmacaoVisitante(
      agendamento,
      tituloAnuncio,
      nomeCorretor,
      true
    ),
  };

  return await enviarEmail(email);
}

export async function enviarEmailRecusaVisitante(
  agendamento: AgendamentoVisita,
  tituloAnuncio: string,
  nomeCorretor: string
): Promise<boolean> {
  const email: EmailNotificacao = {
    para: agendamento.email_visitante,
    assunto: `Sua solicitação de visita: ${tituloAnuncio}`,
    corpo: gerarCorpoEmailConfirmacaoVisitante(
      agendamento,
      tituloAnuncio,
      nomeCorretor,
      false
    ),
  };

  return await enviarEmail(email);
}

function gerarCorpoEmailNotificacaoCorretor(
  agendamento: AgendamentoVisita,
  tituloAnuncio: string,
  endereco: string,
  nomeCorretor: string
): string {
  const dataFormatada = new Date(agendamento.data_horario_sugerido).toLocaleString(
    "pt-BR"
  );

  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2>Nova Solicitação de Visita</h2>
        <p>Olá ${nomeCorretor},</p>
        <p>Um visitante solicitou uma visita ao seguinte imóvel:</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${tituloAnuncio}</h3>
          <p><strong>Endereço:</strong> ${endereco}</p>
        </div>

        <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h4>Dados do Visitante</h4>
          <p><strong>Nome:</strong> ${agendamento.nome_visitante}</p>
          <p><strong>Telefone:</strong> ${agendamento.telefone_visitante}</p>
          <p><strong>E-mail:</strong> ${agendamento.email_visitante}</p>
          <p><strong>Data/Hora Sugerida:</strong> ${dataFormatada}</p>
        </div>

        <p>Acesse seu painel para confirmar ou recusar esta solicitação.</p>

        <p>Atenciosamente,<br/>
        <strong>Imobiliarista.net</strong></p>
      </body>
    </html>
  `;
}

function gerarCorpoEmailConfirmacaoVisitante(
  agendamento: AgendamentoVisita,
  tituloAnuncio: string,
  nomeCorretor: string,
  confirmada: boolean
): string {
  const dataFormatada = new Date(agendamento.data_horario_sugerido).toLocaleString(
    "pt-BR"
  );

  if (confirmada) {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
          <h2 style="color: #388e3c;">Sua Visita foi Confirmada!</h2>
          <p>Olá ${agendamento.nome_visitante},</p>
          <p>Ótima notícia! Sua solicitação de visita foi confirmada.</p>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>${tituloAnuncio}</h3>
            <p><strong>Data/Hora:</strong> ${dataFormatada}</p>
            <p><strong>Corretor:</strong> ${nomeCorretor}</p>
          </div>

          <p>O corretor entrará em contato com você para confirmar os detalhes finais.</p>
          <p>Obrigado por usar Imobiliarista.net!</p>

          <p>Atenciosamente,<br/>
          <strong>Imobiliarista.net</strong></p>
        </body>
      </html>
    `;
  }

  return `
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #d32f2f;">Solicitação de Visita</h2>
        <p>Olá ${agendamento.nome_visitante},</p>
        <p>Informamos que sua solicitação de visita ao imóvel abaixo foi analisada.</p>

        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>${tituloAnuncio}</h3>
          <p><strong>Data/Hora Sugerida:</strong> ${dataFormatada}</p>
          <p><strong>Corretor:</strong> ${nomeCorretor}</p>
        </div>

        <p>Infelizmente, o corretor não conseguirá atender nesta data/horário.
        Você pode tentar agendar um novo horário ou entrar em contato diretamente com o corretor.</p>

        <p>Atenciosamente,<br/>
        <strong>Imobiliarista.net</strong></p>
      </body>
    </html>
  `;
}

async function enviarEmail(email: EmailNotificacao): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY não configurada");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email.para,
        subject: email.assunto,
        html: email.corpo,
      }),
    });

    if (!response.ok) {
      console.error(`Erro ao enviar e-mail: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (erro) {
    console.error("Erro ao enviar e-mail:", erro);
    return false;
  }
}
