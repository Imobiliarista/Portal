// Formatador VRSync (Grupo OLX = OLX + ZAP + VivaReal) — schema real,
// seção 4.11 do project.md. Substitui o schema fictício anterior
// (<Property>/<Title>/<TransactionType>...) que não correspondia a
// nenhum portal real.
//
// Estrutura do elemento raiz é suposição — não confirmada contra
// documentação oficial (não localizada neste repositório). Confrontar
// com a especificação real do Canal Pro antes deste feed ir pro ar.

import { AnuncioParaExportacao } from "../core";
import { mapearSubTipoImovel } from "../../vrsync-mapper";

function escaparXML(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(nome: string, valor: string | number | undefined): string {
  if (valor === undefined || valor === null || valor === "") return "";
  const texto = typeof valor === "number" ? String(valor) : escaparXML(valor);
  return `      <${nome}>${texto}</${nome}>\n`;
}

function gerarImovel(a: AnuncioParaExportacao): string {
  let xml = `    <Imovel>\n`;
  xml += tag("CodigoImovel", a.id);
  xml += tag("TituloAnuncio", a.titulo);
  xml += tag("SubTipoImovel", mapearSubTipoImovel(a.tipoImovelSlug));
  xml += tag("Bairro", a.bairro);
  xml += tag("Cidade", a.cidadeNome);
  xml += tag("CEP", a.cep);
  xml += tag("Observacao", a.descricao);
  xml += tag("PrecoVenda", a.precoVenda);
  xml += tag("PrecoLocacao", a.precoLocacao);
  xml += tag("AreaTotal", a.areaTotal);
  xml += tag("AreaUtil", a.areaUtil);

  if (a.fotos) {
    for (const foto of a.fotos) {
      xml += tag("Foto", foto);
    }
  }

  xml += tag("Videos", a.videoUrl);
  xml += `    </Imovel>\n`;
  return xml;
}

export function gerarXMLVRSyncOLX(
  _corretorNome: string,
  anuncios: AnuncioParaExportacao[],
): string {
  const cabecalho = `<?xml version="1.0" encoding="UTF-8"?>\n<Carga>\n  <Imoveis>\n`;
  const rodape = `  </Imoveis>\n</Carga>`;
  const imoveis = anuncios.map(gerarImovel).join("");
  return cabecalho + imoveis + rodape;
}
