# Módulos

Ver §38-§52 e §67 do documento normativo. Regra de dependência (§39):

```text
permitido:  modules → business → core → storage
proibido:   core → modules
```

Core nunca importa de `modules/`. Um módulo pode ficar totalmente ausente
sem quebrar o portal, o painel ou o admin.

## Status

Salvo indicado abaixo, os módulos existem apenas como placeholders
(`index.js` + `README.md` próprios, ver §67 para a árvore exata de
arquivos de cada um) — nenhuma lógica de negócio foi implementada neles.

| Módulo | Etapa prevista | Status | Observação |
| --- | --- | --- | --- |
| `appointments` (agendamento-visita) | 9 | placeholder | — |
| `ai-search` (busca-ia) | 9 | placeholder | IA não é dependência da busca básica (§42) |
| `saved-search` (busca-salva-email) | 9 | placeholder | — |
| `financing-calculator` (calculadora-financiamento) | 9 | placeholder | Preferir client-side (§44) |
| `comparison` (comparação de anúncios) | 9 | placeholder | 100% client-side, sem Worker (§45) |
| `feeds` (feed para portais externos) | 9 | placeholder | Formatters por portal em `feeds/formatters/` (§46) |
| `publications` (publicações/blog) | 9 | placeholder | Consome feed externo no Browser (§47) |
| `pwa` | 9 | **implementado** | Isolado — não é dependência do portal (§48). Ver `modules/pwa/README.md` |
| `tour-360` | 9 | placeholder | Campo opcional na projeção pública (§49) |
| `video-youtube` | 9 | placeholder | — |
| `financial` | 10 | placeholder | Transações continuam no Worker (§51) |
| `plans` | 10 | placeholder | Não espalhar checks de plano pela base (§52) |

`modules/future/` reservado para módulos ainda não especificados.

### `pwa` (§48) — escopo real implementado

Manifest + service worker do **portal público** (só; minisite/painel/admin
ficaram de fora deste lote — ver `modules/pwa/README.md#decisões`).
`frontend/manifest.json` e `frontend/service-worker.js` são Static Assets
reais, **gerados** (não escritos à mão) por `npm run generate:pwa` a
partir de `modules/pwa/manifest.js` e `modules/pwa/service-worker.js` —
nenhuma rota de Worker foi adicionada (§94, §73). O único ponto de
contato com o portal é um registro opcional em `frontend/index.html`,
que falha em silêncio se o módulo for removido.
