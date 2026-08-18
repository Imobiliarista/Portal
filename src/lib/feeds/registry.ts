// Registro de formatadores por `portais_independentes.formato` — troca o
// se/então por portal (um por vez, código igual copiado) por um dado:
// cada portal já diz no banco qual formatador usar, o gerador só consulta
// este registro. Seção 4.11 do project.md.

import { AnuncioParaExportacao } from "./core";
import { gerarXMLVRSyncOLX } from "./formatadores/vrsync-olx";

export interface ArquivoGerado {
  conteudo: string;
  contentType: string;
  extensao: string;
}

export interface Formatador {
  gerar(corretorNome: string, anuncios: AnuncioParaExportacao[]): ArquivoGerado;
}

const formatadorVRSyncOLX: Formatador = {
  gerar(corretorNome, anuncios) {
    return {
      conteudo: gerarXMLVRSyncOLX(corretorNome, anuncios),
      contentType: "application/xml; charset=utf-8",
      extensao: "xml",
    };
  },
};

// Chaves na Mão entra aqui como 'chaves-na-mao-xml' quando a
// documentação real das tags (cnm-xml-documentation, citada no
// project.md mas não presente neste repositório) estiver disponível —
// a arquitetura já suporta, só falta o formatador.
export const formatadores: Record<string, Formatador> = {
  "vrsync-xml": formatadorVRSyncOLX,
};
