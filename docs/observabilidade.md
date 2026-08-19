# Observabilidade e Backup — Portal Imobiliarista

> Configurações manuais no dashboard da Cloudflare (não são código, não podem ser automatizadas via deploy).
> Ver project.md, seção 4.13 (Backup e recuperação de desastre do D1).

## 1. Backup e Recuperação do D1

### 1.1 Time Travel — Camada Principal (Automática)

O D1 oferece **Time Travel nativo** que restaura o banco de dados para qualquer ponto dos últimos **30 dias**. Não requer configuração — já vem ativado por padrão em todos os planos (Free e Paid).

#### Quando usar:
- Erro humano: UPDATE/DELETE sem WHERE
- Migration com problema recente
- Bug que modificou dados incorretamente
- Último 30 dias apenas

#### Como restaurar:

##### Opção 1: Via CLI (recomendado)
```bash
# Listar bookmarks disponíveis
wrangler d1 time-travel info imobiliarista-db

# Restaurar para um ponto específico (ex: 12 horas atrás)
wrangler d1 time-travel restore imobiliarista-db \
  --timestamp "2026-08-05T12:00:00Z"

# Ou usar um bookmark retornado pelo comando info
wrangler d1 time-travel restore imobiliarista-db \
  --bookmark "bookmark_abc123xyz"
```

##### Opção 2: Via Dashboard Cloudflare
1. Faça login em https://dash.cloudflare.com/
2. Selecione o domínio "imobiliarista.net"
3. Navegue até **D1 > imobiliarista-db**
4. Abra a aba **Time Travel**
5. Escolha o timestamp desejado e clique **Restore**

**Aviso:** restaurar sobrescreve todos os dados — tenha backup ou certeza.

---

### 1.2 Export Periódico para R2 — Camada de Reforço (Automática)

Um **Cron Trigger** executa automaticamente todo dia **1º de cada mês** às **00:00 UTC**:
- Faz SELECT de todas as tabelas do D1
- Gera um dump SQL SQL formatado
- Salva em R2 em `/backups/d1-export-{ano}-{mes}.sql`

#### Localização dos backups no R2:
- Bucket: `imob-backup-privado` (binding `BACKUP_PRIVADO`, **dedicado e privado** — nunca o bucket `imob-dados` dos JSONs de cidade/corretor, que tem Custom Domain público por desenho)
- Pasta: `/backups/`
- Padrão: `d1-export-2026-08.sql`, `d1-export-2026-09.sql`, ...

**Este bucket nunca deve ter Custom Domain nem r2.dev habilitado** — contém `senha_hash`, CPF e tokens de sessão de todos os corretores. Ver incidente de segurança registrado em `project.md`, Histórico de Decisões (2026-08-19), e a checagem automatizada em `scripts/ci/verificar-bucket-backup-privado.js`.

#### Como acessar:
```bash
# Listar todos os backups
wrangler r2 object list imob-backup-privado --prefix=backups/

# Baixar um backup específico
wrangler r2 object download imob-backup-privado backups/d1-export-2026-08.sql
```

Ou via dashboard Cloudflare:
1. Dashboard > R2 > imob-backup-privado
2. Pasta `/backups/`
3. Clique no arquivo para visualizar ou baixar

#### Retenção:
- Time Travel: 30 dias (nativo)
- Exports em R2: ilimitado (custo de storage irrisório para SQL dump)
- Recomendação: manter pelo menos 12 meses de backups no R2

---

## 2. Rate Limiting — Proteção da Rota de Busca por IA

### 2.1 O Que É

A rota `/api/busca-ia` consome **Neurons** (cota diária: 10.000 do Cloudflare Workers AI). Um único visitante mal-intencionado pode fazer 100 buscas em segundo e esgotar a cota de todo mundo pelo resto do dia.

**Rate Limiting Rule** na Cloudflare protege contra isso **na borda**, antes mesmo de chegar ao Worker.

### 2.2 Configurar no Dashboard Cloudflare

1. **Acesse o dashboard:**
   - Faça login em https://dash.cloudflare.com/
   - Selecione o domínio "imobiliarista.net"

2. **Navegue até Security > Rate Limiting:**
   - Ou: abra a aba **Security** no menu esquerdo
   - Procure por **Rate Limiting Rules** (ou **Advanced Rate Limiting**)

3. **Crie uma nova regra:**

| Campo | Valor | Notas |
|---|---|---|
| **Request criteria** | URI Path = `/api/busca-ia` | Regex: `^/api/busca-ia$` |
| **Rate limit** | 20 requests | Por IP |
| **Time window** | 3600 seconds (1 hora) | Ou 20 buscas/hora por IP |
| **Threshold** | 20+ requests | Limite antes de bloquear |
| **Action** | Block (429 Too Many Requests) | Padrão; opções: Block, Challenge, Log, etc. |

4. **Exemplo visual (dashboard):**
   ```
   URI Path equals "/api/busca-ia"
   AND Requests in the past 3600 seconds > 20
   THEN Respond with: 429 (Too Many Requests)
   ```

5. **Salve a regra.**

#### Ajustar limites conforme necessário:
- **20 buscas/hora é conservador** — bem acima do uso normal.
- Se precisar aumentar por volume real, ajuste para 50-100.
- Visitante legítimo dificilmente faria mais de 5 buscas por sessão.

### 2.3 Verificar Bloqueios

1. Dashboard > **Security > Analytics** (ou **Security Events**)
2. Filtre por **Rate Limiting** para ver tentativas bloqueadas
3. IP atacante, timestamp, número de requisições bloqueadas

---

## 3. Métricas Nativas do Workers

### 3.1 CPU Time — P50 e P99

**O que é:** tempo de processamento em milissegundos (ms).
- **P50:** 50% das invocações são mais rápidas que isso
- **P99:** 99% das invocações são mais rápidas que isso
- Limite do plano Free: 10ms total por invocação

#### Onde visualizar:
1. Dashboard > **Workers & Pages > imobiliarista-portal**
2. Abra a aba **Analytics** (ou **Metrics**)
3. Gráfico de **CPU Time Distribution** mostra P50, P75, P99

#### Interpretação:
- P50 < 5ms → saúde boa
- P99 < 10ms → limite do free tier, começar a otimizar
- P99 > 10ms → algumas invocações podem ser cortadas (risco real)

---

### 3.2 Trace Events (Debug)

**O que é:** logs estruturados de cada requisição (entrada, saída, erro).

#### Ativar coleta:
1. Dashboard > **Workers & Pages > imobiliarista-portal**
2. Abra a aba **Logs** (ou **Real-time Logs**)
3. Padrão: mostra logs de `console.log()` no código do Worker

#### Exemplo de trace estruturado:
```
GET /londrina → JSON_CACHE HIT → R2 response 200 (5ms)
GET /api/auth/login → DB query (15ms) → Resposta 200 (20ms)
GET /api/busca-ia → AI model inference (8ms) → Resposta 200 (25ms)
```

#### Como usar no código:
```typescript
console.log("📊 [trace] tipo_evento=requisicao_leitura, tabela=anuncios, tempo_ms=5");
```

Cloudflare captura todos os `console.log()` e os exibe em **Real-time Logs**.

---

### 3.3 Workers Logs — Dashboard

1. **Acesso rápido:**
   - Dashboard > **Workers & Pages > imobiliarista-portal > Logs**

2. **Filtros disponíveis:**
   - Por timestamp
   - Por nível (log, warn, error)
   - Por texto (busca livre)

3. **Alertas automáticos (ver seção 4):**
   - Criar alerta se erros ultrapassarem X por hora
   - Notificação por e-mail ou Slack

---

## 4. Alertas de Uso — Proteção Contra Overage

### 4.1 O Problema

O plano Free tem limites:
- **Workers:** 100.000 requisições/dia
- **D1:** 5.000.000 linhas lidas/dia, 100.000 linhas escritas/dia
- **R2:** 10 GB storage, 1.000.000 writes/mês, 10.000.000 reads/mês
- **AI (Neurons):** 10.000/dia

Se ultrapassar, o serviço segue funcionando mas começa a cobrar. Sem monitoramento, a conta pode explodir sem aviso.

### 4.2 Configurar Alertas no Dashboard Cloudflare

#### Passo 1: Acesse Billing Alerts
1. Faça login em https://dash.cloudflare.com/
2. Clique no ícone do seu perfil (canto superior direito)
3. Selecione **Billing & Account > Billing Settings**
4. Abra a aba **Notifications** ou **Billing Alerts**

#### Passo 2: Criar um alerta de uso
Cloudflare oferece alertas por serviço:

| Serviço | Opção | Recomendação |
|---|---|---|
| **Workers** | "Usage Alerts" | Alerta quando atingir 80.000 requisições/dia (80% do limite) |
| **D1** | "Storage Alerts" | Alerta quando atingir 4 GB (80% de 5 GB) |
| **R2** | "Storage Alerts" | Alerta quando atingir 8 GB (80% de 10 GB) |
| **D1 Writes** | Não há alerta nativo; ver seção 4.3 | Monitorar manualmente ou via Workers Analytics |

#### Passo 3: Configurar notificação
- **Receber via:** E-mail principal da conta
- **Frequência:** Diariamente (ou imediatamente ao ultrapassar 80%)

#### Exemplo de configuração:
```
Serviço: Cloudflare Workers
Limite: 80.000 requisições/dia
Notificação: E-mail
```

### 4.3 Monitoramento de D1 Writes (Manual)

Cloudflare não oferece alerta automático para D1 writes (100.000/dia no free tier). Alternativas:

#### Opção 1: Log periódico no Worker
```typescript
// No início de cada requisição de escrita
const dataHoje = new Date().toISOString().split('T')[0];
const contageHoje = await env.DB.prepare(
  `SELECT COUNT(*) as cnt FROM escritas_log WHERE data = ?`
).bind(dataHoje).first();

if (contageHoje.cnt > 80000) {
  console.warn("⚠️ ALERTA: 80K writes atingidas hoje!");
}
```

#### Opção 2: Painel do Superadmin
Adicionar uma seção "Saúde do Sistema" no painel do superadmin que exibe:
- Requisições Workers hoje
- Leitura D1 hoje
- Escrita D1 hoje
- Storage D1
- Storage R2

### 4.4 Quando Upgrade para Paid?

**Critérios de upgrade:**

1. **Workers:** Mais de 100K requisições/dia consistentemente
   - Upgrade: $5/mês (unlimited requisições)

2. **D1:** Mais de 5 GB de dados ou padrão de crescimento rápido
   - Upgrade: $0,75/GB-mês

3. **R2:** Mais de 10 GB de storage
   - Upgrade: $0,015/GB-mês

4. **AI (Neurons):** Mais de 10K/dia
   - Upgrade: $0,50 por 100K Neurons

**Recomendação:** Manter Free tier o máximo possível (otimizações em 4.6-4.9 do project.md já cobrem isso). Upgrade só quando volume real justificar, não desde o dia 1.

---

## 5. Verificação Periódica — Checklist

### Mensal:
- [ ] Verificar CPU Time P99 (deve estar < 10ms)
- [ ] Revisar erros em **Real-time Logs** (Workers Analytics)
- [ ] Confirmar que backup mensal foi criado (`ls /backups/`)
- [ ] Revisão de Rate Limiting (algum IP legítimo bloqueado?)

### Trimestral:
- [ ] Revisar crescimento de data (D1 storage, R2 storage)
- [ ] Verificar se o crescimento projeta upgrade em breve
- [ ] Revisar limites de Plano dos corretores (max anúncios, fotos)

### Anual:
- [ ] Arquivar backups mais antigos que 12 meses (opcional)
- [ ] Revisar alertas de billing (mudaram os limites?)
- [ ] Avaliar upgrade de plano Cloudflare se volume justificar

---

## 6. Troubleshooting

### D1 está lento
- Verificar CPU Time P99 (seção 3.1)
- Se > 10ms: a Query está fazendo table scan? Adicionar índice (project.md, 4.9)
- Revisar se há queries de escrita durante requisição de leitura (não deveria, mas verificar)

### Requisições bloqueadas por Rate Limiting
- Verificar IP em **Security > Analytics**
- Se é cliente legítimo: aumentar limite (seção 2.2)
- Se é ataque: confirmar que está bloqueado (status 429)

### Export mensal não criado
- Verificar **Workers Logs** por erros
- Confirmar que Cron Trigger está ativado (wrangler.toml, seção 4.13)
- Se erro de permissão R2: revisar binding JSON_CACHE em wrangler.toml

### AI (Neurons) se esgota todos os dias
- Aumentar limite em Rate Limiting Rule (/api/busca-ia) para bloquear mais cedo
- Ou: usar AI apenas para perfil premium (adicionar flag de módulo)
- Ou: implementar fila de espera (processa busca quando houver quota disponível)

---

## 7. Referências

- **Cloudflare D1 (oficial):** https://developers.cloudflare.com/d1/
- **Time Travel docs:** https://developers.cloudflare.com/d1/platform/time-travel/
- **Workers Analytics:** https://developers.cloudflare.com/workers/observability/metrics/
- **Rate Limiting Rules:** https://developers.cloudflare.com/waf/rate-limiting-rules/
- **Billing Alerts:** https://developers.cloudflare.com/fundamentals/setup/manage-billing/

---

**Última atualização:** agosto 2026 (Lote 13 — Implementação)
