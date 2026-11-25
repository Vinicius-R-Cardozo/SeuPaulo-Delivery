export const kitchenNetworkHint = 'Verifique se o computador do restaurante está conectado à rede SEU PAULO SYSTEM.';

const failureLabels = new Map([
  ['tcp_timeout', 'A impressora não respondeu no tempo esperado.'],
  ['tcp_refused', 'A conexão foi recusada na porta configurada da impressora.'],
  ['tcp_unreachable', 'O computador não conseguiu alcançar a rede ou o endereço da impressora.'],
  ['tcp_connect_failed', 'O computador não conseguiu conectar ao IP e à porta configurados.'],
  ['queue_not_found', 'A fila de impressão configurada não foi encontrada no Windows.'],
  ['queue_access_denied', 'O agente não tem permissão para usar a fila de impressão do Windows.'],
  ['queue_unavailable', 'A fila de impressão do Windows está indisponível ou com erro.'],
  ['queue_paused', 'A fila de impressão está pausada no Windows.'],
  ['printer_offline', 'O Windows indica que a impressora está offline.'],
  ['paper_out', 'O Windows indica falta de papel na impressora.'],
  ['paper_jam', 'O Windows indica papel preso na impressora.'],
  ['printer_unavailable', 'O agente não conseguiu abrir o destino de impressão.'],
  ['invalid_destination', 'O destino de impressão configurado é inválido.'],
  ['invalid_ticket', 'A comanda contém dados que o agente não conseguiu preparar para impressão.'],
  ['partial_write', 'A fila do Windows recebeu apenas parte da comanda.'],
  ['send_failed', 'O envio da comanda foi interrompido.'],
  ['authorization_timeout', 'A autorização para enviar a comanda demorou demais.'],
  ['authorization_failed', 'O agente não conseguiu confirmar a autorização de envio com o painel.'],
  ['confirmation_timeout', 'O agente não confirmou o envio dentro do prazo.'],
]);

export function kitchenFailureMessage(code?: string | null) {
  return code ? failureLabels.get(code) : undefined;
}
