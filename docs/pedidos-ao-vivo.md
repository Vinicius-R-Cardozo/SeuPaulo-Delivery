# Pedidos ao vivo no celular do cliente

O checkout e a retomada do app consultam os pedidos do cliente. Cada pedido em andamento tem uma atividade própria. A tela bloqueada mostra o identificador público, a etapa e, quando disponível, a estimativa em minutos. Tocar abre o acompanhamento. Entrega concluída, retirada concluída ou cancelamento encerram a atividade.

No iPhone, o target OrderWidget usa ActivityKit a partir do iOS 16.1. No Android, a notificação contínua pede promoção a Live Update nos sistemas compatíveis. As permissões do usuário e as configurações do aparelho controlam a apresentação.

## Habilitar em um ambiente do Seu Paulo

1. No Firebase do Seu Paulo, registre o app Android com o applicationId do build. Para distribuição, use `com.seupaulo.delivery`. Coloque o arquivo de configuração do cliente em `android/app/google-services.json` antes de compilar. Ative a API Firebase Cloud Messaging e autorize uma conta de serviço a enviar mensagens nesse projeto.
2. No Apple Developer, habilite Push Notifications para `com.seupaulo.delivery`, registre `com.seupaulo.delivery.OrderWidget` e configure a mesma equipe nos dois targets do workspace iOS. Use uma chave de APNs com permissão para esse app. Configure o ambiente de push de acordo com o perfil de assinatura. Debug usa development e a distribuição usa production.
3. Nos Secrets das Edge Functions do Seu Paulo, configure `ORDER_FCM_SERVICE_ACCOUNT` com o JSON da conta de serviço, `ORDER_APNS_TEAM_ID`, `ORDER_APNS_KEY_ID` e `ORDER_APNS_PRIVATE_KEY` com a chave .p8. Configure também `ORDER_LIVE_WORKER_SECRET` com um segredo aleatório de pelo menos 32 bytes. Esses valores ficam no servidor.
4. Aplique a migração do fluxo de entrega e depois a migração order_live_updates. Publique a Edge Function `order-live` com a configuração de autenticação de `supabase/config.toml`.
5. No Vault do banco desse ambiente, cadastre `order_live_worker_url` com a URL completa da função (https://SEU-PROJETO.supabase.co/functions/v1/order-live) e `order_live_worker_secret` com o mesmo valor de `ORDER_LIVE_WORKER_SECRET`. O cron instalado pela migração verifica a cada dez segundos se há envios pendentes. Um envio com erro transitório volta à fila.
6. Compile os apps com o endereço e a chave pública desse ambiente. No Android, permita notificações. No iPhone, habilite Atividades ao Vivo. Faça um pedido, bloqueie o aparelho e avance as etapas pelo painel e pelo app do entregador. Verifique a chegada, o encerramento após o código e, em outro pedido, o cancelamento. Valide também o build de distribuição em TestFlight com APNs de produção.

A fila envia apenas mudanças de etapa ou de previsão visível. O aparelho recebe a atualização por FCM ou APNs quando o app está em segundo plano. A entrega depende da conexão e dos limites de cada sistema. Ao reabrir o app, ele consulta o estado atual do pedido.
