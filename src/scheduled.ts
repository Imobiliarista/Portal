// Cron Trigger — export mensal do D1 para R2 (Lote 13)
// Executa todo dia 1º de cada mês às 00:00 UTC
// Export em SQL dump, armazenado em /backups/d1-export-{ano}-{mes}.sql
// Ver project.md, seção 4.13

import { Env } from "./index";

interface ScheduledEvent {
  cron: string;
  scheduledTime: Date;
}

type TabelasD1 =
  | "estados"
  | "cidades"
  | "corretores"
  | "minisites"
  | "planos"
  | "config_upload_corretor"
  | "log_isencao"
  | "tipos_negocio"
  | "categorias_imovel"
  | "tipos_imovel"
  | "anuncios"
  | "pre_cadastros"
  | "cotas_portal"
  | "modulos_ativos"
  | "buscas_salvas"
  | "sessoes"
  | "agendamentos_visita"
  | "portais_independentes";

async function exportarTabelasD1(db: D1Database): Promise<string> {
  const tabelas: TabelasD1[] = [
    "estados",
    "cidades",
    "corretores",
    "minisites",
    "planos",
    "config_upload_corretor",
    "log_isencao",
    "tipos_negocio",
    "categorias_imovel",
    "tipos_imovel",
    "anuncios",
    "pre_cadastros",
    "cotas_portal",
    "modulos_ativos",
    "buscas_salvas",
    "sessoes",
    "agendamentos_visita",
    "portais_independentes",
  ];

  let dump = "-- D1 Export — Backup do Database Imobiliarista\n";
  dump += `-- Gerado em: ${new Date().toISOString()}\n\n`;

  for (const tabela of tabelas) {
    try {
      // Obter esquema da tabela
      const schemaBruto = await db.prepare(
        `PRAGMA table_info(${tabela})`,
      ).all();

      if (!schemaBruto || schemaBruto.results?.length === 0) {
        continue; // Tabela não existe
      }

      // Comentário de seção
      dump += `\n-- ========================================\n`;
      dump += `-- Tabela: ${tabela}\n`;
      dump += `-- ========================================\n\n`;

      // Obter dados
      const resultado = await db.prepare(`SELECT * FROM ${tabela}`).all();

      if (resultado.results && resultado.results.length > 0) {
        for (const linha of resultado.results) {
          const colunas = Object.keys(linha);
          const valores = colunas
            .map((col) => {
              const valor = (linha as Record<string, unknown>)[col];

              if (valor === null) {
                return "NULL";
              } else if (typeof valor === "string") {
                // Escapar aspas simples
                const escapado = valor.replace(/'/g, "''");
                return `'${escapado}'`;
              } else if (typeof valor === "boolean") {
                return valor ? "1" : "0";
              } else {
                return String(valor);
              }
            })
            .join(", ");

          dump += `INSERT INTO ${tabela} (${colunas.join(", ")}) VALUES (${valores});\n`;
        }
      }

      dump += "\n";
    } catch (erro) {
      console.error(`Erro ao exportar tabela ${tabela}:`, erro);
      // Continuar com próxima tabela em caso de erro
    }
  }

  return dump;
}

export async function handleScheduled(
  _event: ScheduledEvent,
  env: Env,
): Promise<void> {
  console.log("⏰ Iniciando export mensal do D1...");

  try {
    // Formatar data como ano-mes
    const agora = new Date();
    const ano = agora.getUTCFullYear();
    const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
    const nomeArquivo = `d1-export-${ano}-${mes}.sql`;
    const caminhoR2 = `backups/${nomeArquivo}`;

    // Exportar tabelas
    const sqlDump = await exportarTabelasD1(env.DB);

    // Converter para Blob
    const blob = new Blob([sqlDump], { type: "text/plain;charset=utf-8" });

    // Enviar para R2
    await env.DADOS_CACHE.put(caminhoR2, blob, {
      httpMetadata: { contentType: "text/plain;charset=utf-8" },
      customMetadata: {
        exportedAt: new Date().toISOString(),
        exportType: "d1-backup",
      },
    });

    console.log(`✅ Export concluído: ${caminhoR2}`);
  } catch (erro) {
    console.error("❌ Erro ao exportar D1 para R2:", erro);
    throw erro;
  }
}
