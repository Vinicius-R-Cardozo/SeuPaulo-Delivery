# 🍻 Seu Paulo Delivery

Aplicativo completo de delivery do **Seu Paulo Buteco** (Angola — Betim/MG).
Três ambientes em um só projeto: **Cliente**, **Entregador** e **Painel Administrativo**, com
cardápio, carrinho, cupons, pagamento, acompanhamento de pedido e **rastreamento ao vivo no mapa**.

> Identidade visual extraída da própria marca: vermelho `#A42129`, madeira de boteco, creme de
> papel kraft e o âmbar do chope. Nada de azul genérico de delivery.

---

## ✨ O que já funciona

- **Autenticação** por papel (cliente / entregador / admin) com sessão persistente, cadastro,
  recuperação e redefinição de senha, e validações completas.
- **Cardápio real** do buteco com categorias, busca, personalização de produtos (adicionais,
  remoções, observações) e **preço que atualiza sozinho**.
- **Carrinho + Checkout** com entrega/retirada, endereços salvos, cupons, PIX/cartão/dinheiro
  (com troco) e cálculo de frete por distância.
- **Localização de verdade**: detectar posição atual, buscar endereço, ajustar o pino no mapa,
  salvar múltiplos endereços e definir o principal.
- **Acompanhamento do pedido** com timeline de status e **mapa ao vivo** (restaurante → cliente →
  entregador) com ETA — inspirado na tela de corrida ao vivo da referência LuxDrive, adaptada
  para delivery.
- **App do entregador**: online/offline, pedidos disponíveis, aceitar, fluxo de entrega
  (ir ao restaurante → retirar → entregar → confirmar), histórico e ganhos (hoje/semana/mês).
- **Painel admin**: dashboard com KPIs e gráfico, gestão de pedidos (avançar status, atribuir
  entregador mais próximo, cancelar), CRUD de cardápio, aprovação de entregadores e lista de
  clientes.
- **Notificações** in-app para cliente, entregador e admin.

---

## 🧱 Stack

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4**
- **React Router v7**
- **Leaflet + OpenStreetMap** para mapas (sem chave de API)
- **Supabase** (PostgreSQL + Auth + Realtime + RLS) para produção

---

## 🔌 Dois backends, uma interface

A UI conversa apenas com um contrato único (`DataRepository`, em `src/services/types.ts`).
Existem duas implementações, escolhidas por variável de ambiente:

| Backend | Quando | Precisa de chave? |
| --- | --- | --- |
| **Mock** (`localStorage`) | Demonstração / desenvolvimento | ❌ Funciona de imediato |
| **Supabase** | Produção | ✅ URL + anon key |

Assim o app **roda 100% sem configuração** para demonstração e migra para o Supabase apenas
trocando o `.env` — sem tocar em nenhum componente.

---

## 🚀 1. Como instalar

```bash
npm install
```

## ▶️ 2. Como rodar (modo demonstração, sem Supabase)

```bash
npm run dev
```

Abra `http://localhost:5173`. O backend mock já vem com dados de exemplo.

**Contas de demonstração** (senha `Senha123` para todas):

| Papel | E-mail |
| --- | --- |
| Cliente | `cliente@seupaulo.com` |
| Entregador (aprovado) | `entregador@seupaulo.com` |
| Entregador (em análise) | `entregador2@seupaulo.com` |
| Administrador | `admin@seupaulo.com` |

> Dica de demonstração do fluxo completo: abra o **cliente** em uma janela e o **admin** em uma
> aba anônima. Faça um pedido no cliente; no admin, confirme → prepare → pronto → atribua um
> entregador → “saiu para entrega”. O mapa do cliente passa a mostrar o entregador se movendo.

## ⚙️ 3. Variáveis de ambiente

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

```env
VITE_USE_SUPABASE=false                 # true para usar o Supabase
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica
```

> 🔒 A `anon key` é pública por design (protegida por RLS). As chaves **secretas**
> (`service_role`, tokens de gateway de pagamento) **nunca** entram no frontend nem neste
> repositório — vivem só no backend (Edge Functions / servidor).

## 🗄️ 4. Como configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode os arquivos de `supabase/migrations/` **nesta ordem**:
   1. `0001_init.sql` — tabelas, índices, triggers e Realtime.
   2. `0002_rls.sql` — Row Level Security (segurança por papel).
   3. `0003_seed.sql` — cardápio real + cupons (gerado por `npm run gen:seed`).
3. Em **Project Settings → API**, copie a `Project URL` e a `anon public key` para o `.env`.
4. Defina `VITE_USE_SUPABASE=true` e rode `npm run dev`.

O cadastro cria o usuário no **Supabase Auth**; um gatilho (`handle_new_user`) cria
automaticamente a linha em `profiles` com o papel escolhido.

> Para criar o **admin**: cadastre-se normalmente e, no SQL Editor, rode
> `update public.profiles set role='admin' where email='seu@email.com';`

## 🐍 Backend FastAPI + ngrok

Além do backend mock e do Supabase, o projeto traz uma **API própria em FastAPI +
uvicorn** (pasta `backend/`), no mesmo estilo da referência LuxDrive (app + routers
+ schemas). Ela cobre todo o domínio (auth com senha em hash, cardápio, endereços,
cupons, pedidos com **rastreamento ao vivo**, entregadores e notificações), com
autorização por papel no servidor. Persistência em arquivo JSON (sem banco externo);
em produção troca-se por Postgres/Supabase mantendo a forma dos dados.

### Rodar o backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Docs interativas em `http://localhost:8000/docs`. Contas de teste iguais às do app
(senha `Senha123`). Para regenerar o seed do cardápio a partir do front:
`npm run gen:seed:backend` (na raiz).

### Apontar o app para o backend

No `.env` (ou `.env.local`) do frontend:

```env
VITE_API_URL=http://localhost:8000
```

Com `VITE_API_URL` definido, o app usa a API FastAPI (tem prioridade sobre o
Supabase). Sem ela, cai no Supabase (se configurado) ou no mock.

### Expor via ngrok (para o app Android / celular)

O celular/emulador não enxerga o `localhost` do seu PC. O **ngrok** cria uma URL
pública para o backend:

```bash
# 1. (uma vez) autentique o ngrok com SEU token de https://dashboard.ngrok.com
ngrok config add-authtoken SEU_TOKEN

# 2. com o backend rodando na 8000, abra o túnel
ngrok http 8000
```

O ngrok mostra uma URL `https://xxxx.ngrok-free.app`. Coloque-a no `.env`:

```env
VITE_API_URL=https://xxxx.ngrok-free.app
```

Depois **reconstrua** e sincronize o app Android (a URL é embutida no build):

```bash
npm run android:sync    # build + cap sync android
```

> A URL gratuita do ngrok muda a cada execução — ao reabrir o túnel, atualize o
> `VITE_API_URL` e rode `npm run android:sync` de novo.

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
├── services/       → contrato DataRepository + backends mock e supabase + pagamentos
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

## 💳 Sistema de pagamentos

A camada de pagamentos é **isolada** (`src/services/payments.ts`) e define status
`pending / approved / failed / refunded`. O provedor incluído é apenas de **demonstração** —
ele **não cobra de verdade**. Em produção, a cobrança (PIX/cartão) deve ser feita por um gateway
no **backend** (Mercado Pago, Stripe, Asaas) e confirmada por **webhook**, que atualiza
`orders.payment_status`. Nunca processe pagamento como “seguro” no frontend.

---

## 📜 Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (typecheck + Vite) |
| `npm run preview` | Serve o build |
| `npm run typecheck` | Checagem de tipos |
| `npm run gen:seed` | Regera `supabase/migrations/0003_seed.sql` a partir do cardápio |

---

Feito com carinho para o **Seu Paulo Buteco** — o boteco na palma da mão. 🍺
