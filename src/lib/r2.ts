// Helpers de leitura/escrita no R2 via binding. Genéricos por bucket: o
// chamador passa env.DADOS_CACHE (JSON/XML/backups) ou env.MIDIAS (fotos).
// Seções 4.3 (acesso via binding, não API REST/S3 externa), e 4.8 (sem compressão manual)

export async function escreverJSON(
  bucket: R2Bucket,
  caminho: string,
  dados: unknown,
): Promise<void> {
  const conteudo = JSON.stringify(dados);

  try {
    await bucket.put(caminho, conteudo, {
      httpMetadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=3600",
      },
    });
  } catch (erro) {
    console.error(`Erro ao escrever ${caminho} no R2:`, erro);
    throw erro;
  }
}

export async function lerJSON<T>(
  bucket: R2Bucket,
  caminho: string,
): Promise<T | null> {
  try {
    const objeto = await bucket.get(caminho);
    if (!objeto) {
      return null;
    }
    const conteudo = await objeto.text();
    return JSON.parse(conteudo) as T;
  } catch (erro) {
    console.error(`Erro ao ler ${caminho} do R2:`, erro);
    return null;
  }
}

export async function deletarArquivo(
  bucket: R2Bucket,
  caminho: string,
): Promise<void> {
  try {
    await bucket.delete(caminho);
  } catch (erro) {
    console.error(`Erro ao deletar ${caminho} do R2:`, erro);
    throw erro;
  }
}

export async function estimarTamanhoComprimido(dados: unknown): Promise<number> {
  const json = JSON.stringify(dados);
  return Math.ceil(json.length * 0.25);
}

export async function limparPrefixo(
  bucket: R2Bucket,
  prefixo: string,
): Promise<void> {
  try {
    let cursor: string | undefined;
    const arquivosParaDeletar: string[] = [];

    do {
      const listagem = await bucket.list({ prefix: prefixo, cursor });

      for (const objeto of listagem.objects) {
        arquivosParaDeletar.push(objeto.key);
      }

      cursor = listagem.truncated ? listagem.cursor : undefined;
    } while (cursor);

    for (let i = 0; i < arquivosParaDeletar.length; i += 100) {
      const lote = arquivosParaDeletar.slice(i, i + 100);
      for (const caminho of lote) {
        await deletarArquivo(bucket, caminho);
      }
    }
  } catch (erro) {
    console.error(`Erro ao limpar prefixo ${prefixo} do R2:`, erro);
    throw erro;
  }
}
