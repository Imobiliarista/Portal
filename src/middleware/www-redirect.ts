export function removerWWW(request: Request): Response | null {
  const url = new URL(request.url);

  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.replace('www.', '');
    return Response.redirect(url.toString(), 301);
  }

  return null;
}
