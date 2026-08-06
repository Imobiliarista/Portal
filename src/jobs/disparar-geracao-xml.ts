// Helper: Dispara regeneração de XMLs de portais externos quando anúncios mudam
// Chamado pelos endpoints de CRUD de anúncios

// Dispara regeneração do XML Grupo OLX para um corretor
export async function dispararGeracaoXMLGrupoOLX(
  fila: Queue,
  corretor_slug: string
): Promise<void> {
  const mensagem = {
    tipo: "gerar-xml-grupo-olx",
    corretor_slug,
  };

  await fila.send(mensagem);
  console.log(`→ Geração de XML Grupo OLX enfileirada para corretor "${corretor_slug}"`);
}
