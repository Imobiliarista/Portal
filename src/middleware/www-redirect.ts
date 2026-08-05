// Middleware de remoção do "www" — primeira etapa do fetch()
// Redireciona qualquer requisição que comece com "www." para a versão sem www
// Aplica-se tanto ao domínio raiz (www.imobiliarista.net) quanto a subdomínios (www.marco.imobiliarista.net)
// Ver project.md, seção 4.5.

export function redirecionarSemWww(request: Request): Response | null {
  const url = new URL(request.url);

  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.replace("www.", "");
    return Response.redirect(url.toString(), 301);
  }

  return null;
}
