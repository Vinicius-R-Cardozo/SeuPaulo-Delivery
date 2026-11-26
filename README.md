# 🍻 Seu Paulo Delivery

Aplicativo completo de delivery do **Seu Paulo Buteco** (Angola — Betim/MG).
Três ambientes em um só projeto: **Cliente**, **Entregador** e **Painel Administrativo**, com
cardápio, carrinho, cupons, pagamento, acompanhamento de pedido e **acompanhamento do pedido no mapa**.

> Identidade visual extraída da própria marca: vermelho `#A42129`, madeira de boteco, creme de
> papel kraft e o âmbar do chope. Nada de azul genérico de delivery.

---

## ✨ O que já funciona

- **Autenticação** por papel (cliente / entregador / admin) com sessão persistente, cadastro,
  recuperação e redefinição de senha, e validações completas.
- **Cardápio real** do buteco com categorias, busca, personalização de produtos (adicionais,
  remoções, observações) e **preço que atualiza sozinho**.
- **Carrinho + Checkout** com entrega/retirada, endereços salvos, cupons, cartão/dinheiro
  (com troco) e cálculo de frete por distância.
- **Localização de verdade**: detectar posição atual, buscar endereço, ajustar o pino no mapa,
  salvar múltiplos endereços e definir o principal.
- **Acompanhamento do pedido** com timeline de status e mapa com o restaurante, o endereço de entrega e a posição do entregador.
- **App do entregador**: online/offline, pedidos disponíveis, aceitar, fluxo de entrega
  (ir ao restaurante → retirar → entregar → confirmar), histórico e ganhos (hoje/semana/mês).
- **Painel admin**: dashboard com KPIs e gráfico, confirmação e cancelamento de pedidos, acompanhamento das entregas, CRUD de cardápio, aprovação de entregadores e lista de
  clientes.
- **Notificações** in-app para cliente, entregador e admin.
- **Comanda automática da cozinha** ao confirmar um delivery no admin. [Instalação e operação da impressora](docs/impressao-cozinha.md).

---

## 🧱 Stack

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4**
- **React Router v7**
- **Leaflet + OpenStreetMap** para mapas (sem chave de API)
- **Supabase** (PostgreSQL + Auth + Realtime + RLS) para produção

---

## 🔌 Supabase

O app do cliente/entregador e o painel usam o Supabase para catálogo,
autenticação, endereços, pedidos e entregas.

Os itens e preços iniciais seguem o [cardápio da casa](https://www.seupaulobuteco.com.br/cardapiofinal.pdf) e o [PDF de almoço](https://www.seupaulobuteco.com.br/almoco.pdf).
O almoço tem opções fixas de terça a domingo. Os especiais de terça a sexta mudam automaticamente conforme o dia da semana no fuso de Betim. A equipe pode acrescentar opções de fim de semana pelo painel do delivery.

## 🚀 1. Como instalar

```bash
npm install
```

## ▶️ 2. Como rodar

Preencha as variáveis a seguir e rode `npm run dev`. O app abre em
`http://localhost:5173`. Use uma conta cadastrada no projeto configurado.

## ⚙️ 3. Variáveis de ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Copie a URL e a chave **Publishable** do menu **Connect** do projeto.
A variável `VITE_SUPABASE_ANON_KEY` continua disponível para instalações antigas.
Se ambas estiverem preenchidas, `VITE_SUPABASE_PUBLISHABLE_KEY` tem prioridade.

Mantenha `sb_secret_...`, `service_role` e tokens de pagamento nas variáveis do servidor.

## 🗄️ 4. Como configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode os arquivos de `supabase/migrations/` **nesta ordem**:
   1. `0001_init.sql` — tabelas, índices, triggers e Realtime.
   2. `0002_rls.sql` — Row Level Security (segurança por papel).
   3. `0003_seed.sql` — dados iniciais históricos.
   4. `0005_delivery_codes.sql`, `0006_driver_applications.sql`, `0007_driver_auto_approval.sql` e `0008_signup_verifications.sql`.
   5. `20261123163221_delivery_trip_tracking.sql` — etapas da entrega e localização ao vivo.
   6. Aplique as demais migrações na ordem do diretório. A migração `20261126131404_cardapio_real_disponibilidade.sql` carrega o catálogo oficial e arquiva os registros de demonstração.
3. Em **Connect**, copie a `Project URL` e a `Publishable key` para o `.env`.
4. Rode `npm run dev`.

O cadastro cria o usuário no **Supabase Auth**; um gatilho (`handle_new_user`) cria
automaticamente a linha em `profiles` com o papel escolhido.

> Para criar o **admin**: cadastre-se normalmente e, no SQL Editor, rode
> `update public.profiles set role='admin' where email='seu@email.com';`

### Edge Function de cadastro

Com as migrações numeradas aplicadas até `0008_signup_verifications.sql`, publique
a função `signup-code` para o app conseguir solicitar e verificar códigos de e-mail.
Autentique o domínio e cadastre o remetente no Brevo. Em **Edge Functions → Secrets**
do Supabase, configure `BREVO_API_KEY` e use `nao-responda@seupaulobuteco.com.br`
como valor de `BREVO_FROM_EMAIL`.

```bash
supabase functions deploy signup-code --project-ref SEU_PROJETO
```

O Supabase disponibiliza `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` e
`SUPABASE_SECRET_KEYS` no ambiente da função. Ela usa a chave secreta
`default` e mantém compatibilidade com `SUPABASE_SERVICE_ROLE_KEY`.
A função confere a chave pública enviada em `apikey`, pois o cadastro começa
antes de o cliente ter uma sessão.

### Recuperação de senha do delivery

O link abre `https://www.seupaulobuteco.com.br/delivery/redefinir-senha` no celular
ou no computador. A página fica no repositório **Seu-Paulo-Buteco**. A pessoa
confirma o link antes de ver o formulário de nova senha.

1. Publique a página do site com `DELIVERY_SUPABASE_URL` e
   `DELIVERY_SUPABASE_PUBLISHABLE_KEY` do projeto `seu-delivery`.
2. No mesmo projeto, adicione a URL HTTPS acima em **Authentication → URL Configuration → Redirect URLs**.
3. Em **Authentication → Email Templates → Reset password**, use o assunto
   `Redefina sua senha · Seu Paulo` e o conteúdo de `supabase/templates/recovery.html`.
   O template usa o link novo para o Delivery e o link padrão para os outros destinos.
4. Distribua uma build do app com o fluxo novo. Para testar, solicite um novo link
   pelo app e abra o e-mail em outro dispositivo ou navegador.

O modelo é em português. Para enviar a clientes fora da equipe do projeto e usar
um remetente do Seu Paulo, configure o SMTP próprio no Supabase com um domínio
autenticado. Mantenha o rastreamento de cliques desativado para esses e-mails.

## 🖥️ Painel administrativo (site separado — Vercel)

O admin **não fica dentro do app** — ele é um **site próprio** na pasta `admin/`
(projeto Vite independente), que consome o **mesmo Supabase**. Assim você mexe no
painel sem tocar no aplicativo do cliente/entregador.

### Rodar localmente
```bash
cd admin
npm install
# crie admin/.env.local com as chaves do Supabase (ver admin/.env.example)
npm run dev        # http://localhost:5180
```
Entre com uma conta de papel `admin` do projeto configurado.

### Deploy no Vercel
1. Importe o repositório no Vercel (**Add New → Project**).
2. Em **Root Directory**, selecione a pasta **`admin`**.
3. Framework: **Vite** (build `npm run build`, output `dist` — detectado automaticamente).
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL = https://SEU-PROJETO.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY = sb_publishable_...`
5. **Deploy**. O `admin/vercel.json` já cuida do roteamento SPA.

## 🐍 Protótipo FastAPI

A pasta `backend/` contém um protótipo independente com persistência em JSON.
O app e o painel usam o Supabase configurado nas respectivas variáveis de ambiente.

## 📱 App Android (Android Studio)

O projeto está empacotado com **Capacitor**, então roda como app Android nativo
(WebView) — já testado no emulador Pixel 7.

**Pré-requisitos:** Android Studio + Android SDK + um emulador (AVD) ou celular
com depuração USB.

```bash
# 1. Gera os assets web e sincroniza com o projeto nativo
npm run build
npx cap sync android

# 2. Abre no Android Studio (ou abra a pasta android/ manualmente)
npx cap open android
```

No Android Studio, escolha um emulador/dispositivo e clique em **Run ▶**.

Pelo terminal (sem abrir a IDE), dá para gerar o APK de debug direto:

```bash
cd android
./gradlew assembleDebug          # gera app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

> `appId`: `com.seupaulo.delivery` · `appName`: `Seu Paulo Delivery` (em
> `capacitor.config.ts`). As permissões de localização já estão no
> `AndroidManifest.xml`. O `android/local.properties` (caminho do SDK) é gerado
> localmente e fica fora do git.

Sempre que mudar o código web, rode `npm run build && npx cap sync android` antes
de recompilar o app.

### Entregas e localização em segundo plano

Depois de `0008_signup_verifications.sql`, aplique `supabase/migrations/20261123163221_delivery_trip_tracking.sql` junto com a atualização do painel e dos apps. Versões anteriores escrevem diretamente em `orders`. A nova versão usa `advance_order` e `confirm_delivery`.

O restaurante confirma o pedido no painel. Um entregador aprovado e online aceita no app, registra a chegada ao restaurante e toca em **Retirei o pedido · Iniciar entrega**. O cliente acompanha no mapa a última posição recebida e seu horário. Ao chegar, o entregador toca em **Cheguei ao cliente** e informa o código de quatro dígitos para concluir. Os códigos de seis dígitos já emitidos continuam válidos.

Atualize os apps em uso pelos entregadores antes de aplicar `20261125163857_four_digit_delivery_codes.sql`. A versão anterior do app exige seis dígitos para enviar a confirmação.

O Android inicia um serviço de localização com notificação durante o trajeto. O iOS usa Core Location com o modo de localização em segundo plano. Para compilar para iPhone, em um Mac com Xcode e CocoaPods, rode `npm run build`, `npx cap sync ios` e `npx cap open ios`. O navegador usa o GPS enquanto a página está ativa. Após forçar a parada do aplicativo, reabra-o para retomar uma entrega em andamento.

## 🗺️ 5. Como configurar mapas/localização

Os mapas usam **Leaflet + OpenStreetMap**, que **não exigem chave de API** — funciona out of the
box. A geocodificação (busca e reverse) usa o **Nominatim** (OSM).

- O ponto do restaurante fica em `src/data/restaurant.ts` (coordenadas reais da casa).
- Para produção com volume, troque o provedor de tiles/geocoding por um pago
  (Mapbox, Google, LocationIQ) respeitando os limites de uso — a troca é isolada em
  `src/services/geocoding.ts` e `src/components/maps/`.

---

## 🧭 Estrutura das aplicações

```
src/
├── components/
│   ├── ui/         → botões, inputs, modais, badges, skeletons (reutilizáveis)
│   ├── layout/     → shells e navegação de cada ambiente + guarda de rota
│   ├── maps/       → DeliveryMap (rastreamento) e AddressPickerMap
│   └── menu/       → ProductCard
├── contexts/       → AuthContext, CartContext
├── providers/      → AppProviders, ToastProvider
├── hooks/          → useMenu, useOrders (realtime), useDriver, useGeolocation
├── services/       → contrato DataRepository e integração com o Supabase
├── pages/
│   ├── auth/       → login, cadastro, recuperar/redefinir senha (cliente)
│   ├── customer/   → home, cardápio, produto, carrinho, checkout, pedidos, tracking, endereços, perfil
│   ├── driver/     → home, entrega ativa, histórico, ganhos, perfil (+ auth)
│   └── admin/      → dashboard, pedidos, cardápio, entregadores, clientes (+ auth)
├── data/           → restaurant.ts + menu.ts (fonte do cardápio)
├── types/          → modelo de domínio tipado
└── utils/          → formatação, validação, geo (haversine/rota/ETA), status
```

## 🗃️ Estrutura do banco (Supabase)

| Tabela | Função |
| --- | --- |
| `profiles` | usuário + papel (customer/driver/admin), 1:1 com `auth.users` |
| `addresses` | endereços do cliente (com lat/lng) |
| `categories`, `products` | cardápio (produtos com `addon_groups` em JSONB) |
| `coupons`, `coupon_usage` | cupons e controle de uso |
| `orders` | pedidos (itens, endereço e histórico como snapshots JSONB) |
| `order_items`, `order_status_history` | versões normalizadas (BI/relatórios) |
| `drivers`, `driver_locations` | entregadores e trilha de localização |
| `payments` | intents/registros de pagamento (confirmação por webhook) |
| `notifications` | notificações por usuário |

**Segurança (RLS):** cada cliente só enxerga os próprios dados/pedidos; o entregador vê apenas
entregas atribuídas a ele (e as disponíveis para aceitar); o admin tem acesso amplo. As funções
`is_admin()` / `is_driver()` sustentam as políticas. **O frontend nunca é a fronteira de
confiança** — toda regra vive no banco.

---

## 💳 Pagamento no recebimento

O checkout oferece dinheiro ou cartão no recebimento. O pedido começa com
pagamento pendente. No fluxo de entrega, a conclusão pelo entregador
registra a confirmação no pedido. O fluxo de PIX online requer um gateway
de pagamento no backend.

## 📜 Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (typecheck + Vite) |
| `npm run preview` | Serve o build |
| `npm run typecheck` | Checagem de tipos |
| `npm run gen:seed` | Emite o SQL do catálogo a partir de `src/data/menu.ts` |

---

Feito com carinho para o **Seu Paulo Buteco** — o boteco na palma da mão. 🍺
