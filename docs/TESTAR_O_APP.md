# Testar o app no celular — do zero ao primeiro teste

Este guia é o caminho completo para começar a testar o app (`apps/mobile`) num aparelho de
verdade: as contas que precisam existir, o que configurar em cada uma, as permissões que o app pede
e o roteiro de teste. Os detalhes de máquina (toolchain Android, firewall, problemas comuns) estão
no [README do app](../apps/mobile/README.md); o runbook de publicação, em
[OPERATIONS → Release do app nativo](./OPERATIONS.md#release-do-app-nativo).

> **Login:** o app entra com **e-mail e senha** pelo Logto, igual à web (ADR 008). Não existe
> "Entrar com Apple" nem "Entrar com Google". As contas da Apple e do Google deste guia são as de
> **desenvolvedor**, para gerar e distribuir o app.

---

## 1. Escolha o caminho

| Caminho                  | O que funciona                                                                 | O que **não** funciona                      | Precisa de                                       |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------ |
| **A. Expo Go**           | login, todas as telas, câmera (código de barras e foto), galeria, chat, ditado | avisos (push), compra real, link `fatia://` | só o app Expo Go da loja                         |
| **B. Dev build Android** | tudo do A + push, compra de teste, link `fatia://`                             | —                                           | conta Expo; Firebase para push; Play para compra |
| **C. Dev build iPhone**  | igual ao B                                                                     | —                                           | conta Expo **e** Apple Developer (US$ 99/ano)    |

**Recomendação:** comece pelo **A** hoje (meia hora), siga para o **B** quando quiser testar push e
compra. O **C** só depois da conta Apple aprovada — sem ela não há como instalar um build próprio
num iPhone a partir do Linux.

---

## 2. As contas, uma por uma

Faça só as do caminho escolhido. Nada aqui entra no repositório: chaves e certificados ficam nos
próprios serviços ou no EAS.

### 2.1 Expo (grátis) — caminhos B e C

1. Crie a conta em <https://expo.dev/signup>.
2. Na máquina:
   ```bash
   pnpm --filter @fatia/mobile exec eas login
   cd apps/mobile && pnpm exec eas init     # cria o projeto "fatia" e mostra o projectId
   ```
3. O `eas init` tenta gravar o `projectId` no `app.config.ts`, mas aqui ele vem de variável. Copie
   o id mostrado e cadastre em **expo.dev → projeto fatia → Environment variables** como
   `EAS_PROJECT_ID` (visibilidade _Plain text_, ambientes _development_, _preview_ e _production_).
   Para rodar local, ponha o mesmo valor em `apps/mobile/.env`.

Sem o `EAS_PROJECT_ID` o app não recebe avisos: Perfil → Notificações diz "Esta versão do app não
recebe avisos".

### 2.2 Apple Developer Program (US$ 99/ano) — caminho C e loja iOS

1. Inscrição em <https://developer.apple.com/programs/enroll/> com o Apple ID que vai administrar o
   app. **Pessoa física:** aprovação costuma sair em até 48 h. **Pessoa jurídica:** precisa do
   número **D-U-N-S** da empresa (gratuito, pela Apple; pode levar dias) e de um site no domínio.
2. Depois de aprovado:
   - **Certificates, Identifiers & Profiles:** nada a fazer à mão — o EAS cria o App ID
     `br.ia.fat.app`, o certificado e o perfil no primeiro `eas build`, se você deixar ele entrar
     com o seu Apple ID.
   - **Aparelhos de teste:** cada iPhone que vai receber o dev build precisa ser registrado:
     ```bash
     cd apps/mobile && pnpm exec eas device:create   # gera um link; abra no iPhone e instale o perfil
     ```
   - **Chave de push (APNs):** o EAS gera no primeiro build com notificações, quando pergunta
     "Generate a new Apple Push Notifications service key?" → **Yes**.
   - **Modo desenvolvedor no iPhone (iOS 16+):** Ajustes → Privacidade e Segurança → Modo
     Desenvolvedor → ligar e reiniciar. Sem isso o dev build não abre.
3. **App Store Connect** (<https://appstoreconnect.apple.com>), só para compra e TestFlight:
   - **Contratos, Impostos e Bancos:** assine o contrato de **Apps Pagos** e preencha dados
     bancários e fiscais. Sem esse contrato ativo, nenhuma assinatura aparece nem em teste.
   - **Meus Apps → +:** crie o app com o bundle `br.ia.fat.app`.
   - **Assinaturas:** grupo "Fatia PRO" com `fatia_pro_mensal` e `fatia_pro_anual` (ver §2.5).
   - **Usuários e Acesso → Sandbox → Testadores:** crie um testador sandbox com um e-mail que **não**
     seja Apple ID. No iPhone, ele entra em Ajustes → App Store → Conta Sandbox (aparece depois da
     primeira compra de teste).

### 2.3 Google Play Console (US$ 25, uma vez) — compra no Android e loja

1. Cadastro em <https://play.google.com/console/signup>. Há verificação de identidade (documento) e,
   para conta **pessoal** nova, uma regra da loja: antes de publicar em produção, o app precisa
   passar **14 dias em teste fechado com pelo menos 12 testadores**. Teste **interno** (até 100
   pessoas) não tem essa exigência e é o que usamos para testar.
2. **Criar app:** nome Fatia, pacote `br.ia.fat.app` (definido no primeiro envio).
3. **Primeiro envio:** a compra só funciona num app que já existe na Play, mesmo em teste. Gere e
   envie um build:
   ```bash
   cd apps/mobile
   pnpm exec eas build --profile preview --platform android    # ou production (.aab)
   pnpm exec eas submit --platform android                      # pede a chave de conta de serviço da Play
   ```
   A chave de conta de serviço para o `eas submit` se cria em Google Cloud → IAM → Contas de
   serviço, e depois em Play Console → Usuários e permissões → convidar o e-mail da conta.
4. **Teste interno → Testadores:** adicione os e-mails Google de quem vai testar e mande o link de
   adesão.
5. **Configuração → Teste de licença:** adicione os mesmos e-mails. Compras desses e-mails são de
   teste (não cobram, e a assinatura renova em minutos).
6. **Monetizar → Assinaturas:** `fatia_pro_mensal` e `fatia_pro_anual` (ver §2.5).
7. **Integridade do app → Assinatura do app:** copie a impressão digital **SHA-256** do
   certificado de assinatura do app — ela vira `ANDROID_CERT_SHA256` na web para o link universal
   do convite.

### 2.4 Firebase (grátis) — push no Android

O Android entrega push pelo FCM, do Google, mesmo usando a Expo no meio.

1. <https://console.firebase.google.com> → **Adicionar projeto** (o Analytics pode ficar desligado).
2. **Adicionar app → Android**, pacote `br.ia.fat.app`. Baixe o **`google-services.json`**.
   - Ele **não** vai para o git (está no `.gitignore`).
   - Na Expo: **Environment variables → Create → tipo _File_**, nome `GOOGLE_SERVICES_JSON`, com o
     arquivo. O `app.config.ts` usa o caminho que a EAS entrega no build.
   - Para build local, deixe o arquivo em `apps/mobile/google-services.json` e exporte
     `GOOGLE_SERVICES_JSON=./google-services.json` antes de compilar.
3. **Configurações do projeto → Contas de serviço → Gerar nova chave privada** (JSON). Essa é a
   chave **FCM v1**, que a Expo usa para enviar:
   ```bash
   cd apps/mobile && pnpm exec eas credentials
   # Android → production (ou development) → Google Service Account
   #   → Manage your Google Service Account Key for Push Notifications (FCM V1) → Upload
   ```
4. Na API (Dokploy, já listado no `docker-compose.prod.yml`): `PUSH_ENABLED=true`. O
   `EXPO_ACCESS_TOKEN` só é necessário se você ligar _Enhanced Security for Push Notifications_ no
   projeto da Expo.

### 2.5 RevenueCat (grátis até US$ 2,5 mil/mês de receita) — compra no app

Detalhes completos em [BILLING.md](./BILLING.md#app-revenuecat); o resumo:

1. Conta em <https://app.revenuecat.com>, projeto **Fatia**.
2. **Apps:** adicione o app **App Store** (bundle `br.ia.fat.app`, com a chave _In-App Purchase_ do
   App Store Connect) e o **Play Store** (pacote `br.ia.fat.app`, com a conta de serviço da Play com
   acesso financeiro).
3. **Produtos:** importe `fatia_pro_mensal` e `fatia_pro_anual` das duas lojas.
4. **Entitlement** `pro` com os dois produtos. **Offering** padrão com os pacotes `$rc_monthly` e
   `$rc_annual`.
5. **Integrations → Webhooks:** `https://api.<domínio>/api/billing/webhooks/revenuecat`, com o
   cabeçalho _Authorization_ igual a `REVENUECAT_WEBHOOK_AUTH` da API.
6. **API keys:**
   - chaves **públicas** `appl_…` e `goog_…` → variáveis da Expo `EXPO_PUBLIC_REVENUECAT_IOS_KEY` e
     `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`;
   - chave **secreta** v1 `sk_…` → `REVENUECAT_SECRET_KEY` na API (nunca no app).

Sem as chaves públicas, a tela Meu plano mostra o plano mas avisa que a assinatura não está
disponível neste build — é o comportamento esperado no Expo Go.

### 2.6 Logto — o app "Fatia Mobile"

O app usa uma Application do tipo **Native** (pública, com PKCE), separada da web.

- **Local:** `pnpm logto:bootstrap` já cria `Fatia Mobile` e grava o App ID em `apps/mobile/.env`.
- **Produção:** no console do Logto → Applications → Create → **Native**, nome `Fatia Mobile`,
  _Redirect URI_ e _Post sign-out redirect URI_ `fatia://auth/callback`. O App ID vira
  `EXPO_PUBLIC_LOGTO_APP_ID` nas variáveis da Expo.
- **Expo Go:** cadastre também o endereço `exp://…/--/auth/callback` que o Metro imprime na linha
  `[auth] redirect_uri:` ao tocar em Entrar (muda com o IP da rede).

### 2.7 Langfuse (grátis no plano Hobby) — ver o que o chat fez

Não é necessário para testar o app, mas é onde se investiga uma resposta ruim ou um erro do chat.
Criação do projeto e chaves em [OPERATIONS → Chat e agente](./OPERATIONS.md#chat-e-agente).

---

## 3. Variáveis do build

Tudo que começa com `EXPO_PUBLIC_` vai dentro do app e é legível por quem o baixar — **nenhum
segredo entra aí**. O `eas.json` já traz a URL da API, do Logto e a audience de produção; o resto
vem das **Environment variables** do projeto na Expo:

| Variável                             | De onde vem                      | Sem ela                                 |
| ------------------------------------ | -------------------------------- | --------------------------------------- |
| `EXPO_PUBLIC_LOGTO_APP_ID`           | Logto (§2.6)                     | a tela de login lista o que falta       |
| `EAS_PROJECT_ID`                     | `eas init` (§2.1)                | sem push                                |
| `GOOGLE_SERVICES_JSON` (arquivo)     | Firebase (§2.4)                  | sem push no Android                     |
| `EXPO_PUBLIC_IAP_ENABLED`            | `true` para vender PRO no app    | sem compra no app (o padrão do piloto)  |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`     | RevenueCat (§2.5)                | sem compra no iPhone                    |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat (§2.5)                | sem compra no Android                   |
| `APP_LINKS_HOST`                     | domínio da web (`app.fat.ia.br`) | o convite abre no navegador, não no app |

`APP_LINKS_HOST` só funciona se a web servir os arquivos de link universal, o que exige
`APPLE_TEAM_ID` (Apple Developer → Membership) e `ANDROID_CERT_SHA256` (§2.3, passo 7) na web.

---

## 4. Rodar

### 4.1 Caminho A — Expo Go contra a sua máquina

```bash
pnpm bootstrap            # uma vez: Logto, banco, dados de demonstração
bash scripts/dev.sh       # Postgres, Logto, Mailpit, mídia, agente, API e web
```

Em outro terminal, siga o [README do app](../apps/mobile/README.md#rodando-contra-o-backend-local):
troque `localhost` pelo IP da máquina em `apps/mobile/.env`, libere o firewall e:

```bash
pnpm --filter @fatia/mobile start
```

Leia o QR Code com o Expo Go (celular na mesma rede Wi-Fi). Entre com uma das contas de
demonstração:

| Conta                | Senha                | Para quê                              |
| -------------------- | -------------------- | ------------------------------------- |
| `demo@fatia.local`   | `Fatia-demo-2026!`   | pessoa comum, membro da Academia Demo |
| `equipe@fatia.local` | `Fatia-equipe-2026!` | dona da Academia Demo (painel)        |

**Imagens e vídeos no celular:** a API assina os endereços de mídia com `MEDIA_S3_ENDPOINT`, que no
`.env` da raiz vem como `http://localhost:8333`. Para o celular enxergar as imagens, troque por
`http://<SEU_IP>:8333`, libere a porta 8333 no firewall como as outras e reinicie a API. A web na
máquina continua funcionando, porque o IP também vale para ela.

**E-mails** (convite, recuperação de senha) chegam no Mailpit: <http://localhost:8025>.

### 4.2 Caminho B — dev build Android

```bash
cd apps/mobile
pnpm exec eas build --profile development --platform android
```

Instale o `.apk` pelo link que a EAS mostra (abra no celular) e rode o Metro com
`pnpm --filter @fatia/mobile start:dev`. O dev build se conecta ao Metro como o Expo Go, mas com os
módulos nativos do app. Para compilar localmente, sem a nuvem, siga a seção
[Development build → Local](../apps/mobile/README.md#local-sem-conta-em-serviço-nenhum) do README.

> O perfil `development` aponta para produção (`api.fat.ia.br`). Para usar a sua máquina, deixe o
> `.env` local com o IP: no `start:dev` ele vale para o bundle servido pelo Metro.

### 4.3 Caminho C — dev build iPhone

Depois do §2.2 (conta aprovada e iPhone registrado):

```bash
cd apps/mobile
pnpm exec eas build --profile development --platform ios
```

Instale pelo link/QR da EAS, ligue o Modo Desenvolvedor e rode o Metro com `start:dev`.

---

## 5. Permissões que o app pede

Nenhuma é pedida ao abrir o app: cada uma aparece na primeira vez que a função é usada.

| Permissão           | Quando aparece                                                       | Se negar                                                                                   |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Câmera**          | Nutrição → ler código de barras ou foto do prato; chat → anexar foto | a tela explica e oferece "Abrir configurações"; busca e registro manual seguem funcionando |
| **Fotos / galeria** | escolher foto do prato, imagem do mural, capa, vídeo da comunidade   | não dá para anexar; o resto segue                                                          |
| **Notificações**    | ao iniciar o primeiro descanso do treino; ao ligar avisos no Perfil  | o cronômetro continua na tela; Perfil → Notificações oferece "Abrir configurações"         |
| **Microfone**       | chat → ditar a mensagem por voz                                      | o botão de ditado some; digitar segue funcionando                                          |

No **Android 13+** a de notificações é um diálogo do sistema; no **iOS** todas são diálogos do
sistema e, depois de negadas, só voltam pelos Ajustes. Para refazer o teste do zero: desinstale o
app (ou, no Android, Configurações → Apps → Fatia → Armazenamento → Limpar dados).

---

## 6. Roteiro de teste

Siga a lista [O que ainda precisa de aparelho](./MOBILE_PARITY.md#o-que-ainda-precisa-de-aparelho)
do MOBILE_PARITY, que cobre login, Nutrição, treino, comunidade, painel, mural, avisos, compra e
chat item por item. Uma ordem que rende:

1. **Expo Go, conta demo:** login → assistente de primeira vez → registrar refeição (busca, código de
   barras, foto) → treino com descanso → Progresso → comunidade (mural, desafios) → chat.
2. **Expo Go, conta equipe:** painel da Academia Demo (membros, convite, conteúdo, agente).
3. **Dev build:** avisos (comentar com uma conta um post da outra, com o app fechado), link
   `fatia://c/<token>` de um convite, compra de teste, resposta do chat chegando com o app fechado.
4. **Sair da conta** em cada caminho: a próxima pessoa não herda sessão, compra nem avisos.

Achou algo? Anote o aparelho, o sistema, o caminho (A, B ou C) e o horário — o horário é o que
permite achar a requisição nos logs da API e o trace no Langfuse.
