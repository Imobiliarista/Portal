# Módulos

Ver §38-§52 e §67 do documento normativo. Regra de dependência (§39):

```text
permitido:  modules → business → core → storage
proibido:   core → modules
```

Core nunca importa de `modules/`. Um módulo pode ficar totalmente ausente
sem quebrar o portal, o painel ou o admin.

## Status (Etapa 1 — Fundação)

Todos os módulos abaixo existem apenas como placeholders (`index.js` +
`README.md` próprios, ver §67 para a árvore exata de arquivos de cada um).
Nenhuma lógica de negócio foi implementada neste lote.

| Módulo | Etapa prevista | Observação |
| --- | --- | --- |
| `appointments` (agendamento-visita) | 9 | — |
| `ai-search` (busca-ia) | 9 | IA não é dependência da busca básica (§42) |
| `saved-search` (busca-salva-email) | 9 | — |
| `financing-calculator` (calculadora-financiamento) | 9 | Preferir client-side (§44) |
| `comparison` (comparação de anúncios) | 9 | 100% client-side, sem Worker (§45) |
| `feeds` (feed para portais externos) | 9 | Formatters por portal em `feeds/formatters/` (§46) |
| `publications` (publicações/blog) | 9 | Consome feed externo no Browser (§47) |
| `pwa` | 9 | Isolado — não é dependência do portal (§48) |
| `tour-360` | 9 | Campo opcional na projeção pública (§49) |
| `video-youtube` | 9 | — |
| `financial` | 10 | Transações continuam no Worker (§51) |
| `plans` | 10 | Não espalhar checks de plano pela base (§52) |

`modules/future/` reservado para módulos ainda não especificados.
