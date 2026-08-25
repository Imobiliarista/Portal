// modules/appointments/routes.js
//
// Intencionalmente vazio neste lote — mesmo motivo de service.js. §41
// lista `routes.js` na árvore do módulo, mas isso pressupõe uma rota de
// Worker (ex. `POST /api/public/appointments`) recebendo o agendamento.
//
// Decisão confirmada com o solicitante (ver
// modules/appointments/README.md#decisões): o agendamento é 100%
// client-side (form → `wa.me`), sem requisição nenhuma ao Worker — §94
// ("pode ser Browser? Se sim, não adicionar nova peça") se aplica
// diretamente aqui. Nenhuma rota foi registrada em worker/index.js.

export {};
