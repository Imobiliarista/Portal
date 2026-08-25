// modules/appointments/service.js
//
// Intencionalmente vazio neste lote. §41 lista `service.js` na árvore de
// arquivos do módulo — o nome sugere uma camada de negócio com I/O
// (análoga a business/listings.js), mas isso pressupõe persistir o
// agendamento em algum lugar (R2 PRIVATE) para o corretor consultar
// depois.
//
// Decisão confirmada com o solicitante antes deste lote (ver
// modules/appointments/README.md#decisões): o fluxo real de agendamento
// não persiste nada no backend — é um redirecionamento client-side para o
// WhatsApp do corretor (`https://wa.me/...`), mesmo padrão que o site atual
// já usa. Toda a lógica (validação, montagem da mensagem/URL) é pura e
// vive em modules/appointments/index.js + validation.js, sem I/O — não há
// "serviço" para implementar aqui.
//
// Ver README#pendências: se o produto decidir no futuro também guardar um
// histórico de agendamentos no painel do corretor, é aqui que a leitura/
// escrita em R2 PRIVATE entraria (mesmo padrão de business/listings.js).

export {};
