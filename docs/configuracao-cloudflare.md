# Configuração Manual — Cloudflare Dashboard

Este documento descreve as configurações que **não podem ser feitas via código/deploy**, mas que devem ser feitas manualmente no dashboard da Cloudflare para funcionamento completo do projeto.

## Rate Limiting Rule — Rota de Busca por IA

**Por quê:** A rota `/api/busca-ia` consome Neurons da cota diária de Cloudflare Workers AI (10.000 Neurons/dia no free tier). Para proteger essa cota compartilhada contra abuso por um único visitante, é necessário limitar requisições por IP. Ver seção 4.12 do `project.md`.

**Como configurar:**

1. **Acesse o dashboard da Cloudflare** → imobiliarista.net → **Rules** (seção esquerda).

2. **Procure por "Rate Limiting Rules"** ou "Firewall Rules" (pode variar conforme versão do painel).

3. **Clique em "Create a Rate Limiting Rule"** (ou equivalente).

4. **Configure:**
   - **If incoming requests match:**
     - Campo **URI Path** (ou **Request URL Path**) = **/api/busca-ia**
     - Deixar os outros campos em branco ou com valores padrão
   
   - **Then rate limit these requests:**
     - **Threshold:** 20 (requests)
     - **Period:** 1 hour (ou 3600 segundos)
     - **Rate limit by:** Cloudflare IP
     - **Response:** "Block" (bloqueio com HTTP 429)

5. **Nome sugestivo:** "Rate Limit — Busca por IA" (para encontrar depois)

6. **Clique em Save**.

### Resultado esperado:
- Cada IP pode fazer no máximo 20 requisições à rota `/api/busca-ia` por hora.
- Após ultrapassar o limite, as requisições são respondidas com HTTP 429 Too Many Requests.
- Isso protege a cota de ~10.000 Neurons/dia do free tier, evitando que um único visitante malicioso esgote a cota e derrube a busca pra todo mundo no resto do dia.

---

## Alternativa: Cloudflare Firewall Rules (plano pago)

Se quiser controle mais fino (ex: diferentes limites por rota, por país, etc.), o plano pago oferece **Firewall Rules** com mais opções. Mas para a fase 1, a **Rate Limiting Rule** simples já é suficiente.

---

## Checklist de Implantação

Antes de marcar a feature "Busca por IA" como produção-ready:

- [ ] Rate Limiting Rule criada no dashboard (20 req/hora por IP)
- [ ] Binding de Cloudflare Workers AI adicionado ao `wrangler.toml` (`[ai]`)
- [ ] Variáveis de ambiente configuradas (se houver chaves adicionais — hoje é só binding automático)
- [ ] Deploy realizado (`wrangler deploy`)
- [ ] Módulo ativado no painel do Superadmin (flag `busca-ia` ligada na tabela `modulos_ativos`)
- [ ] Testes manuais: enviar frases em linguagem natural e validar filtros retornados

---

## Monitoramento

No dashboard da Cloudflare → **Analytics** → **Security** → procure por "Rate Limiting" para ver quantas requisições foram bloqueadas. Isso ajuda a avaliar se o limite de 20/hora é apropriado conforme o uso real cresce.
