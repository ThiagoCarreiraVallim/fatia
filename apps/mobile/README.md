# Fatia — app nativo

Réplica do PWA em React Native com Expo. Mesma conta, mesma API, mesmos dados: o
que você faz em `app.fat.ia.br` você faz aqui.

Este documento é sobre **rodar o app na sua máquina**. Para o que o app é e como
ele se encaixa no resto, veja o [README da raiz](../../README.md) e a
[épica #132](https://github.com/ThiagoCarreiraVallim/fatia/issues/132).

---

## O caminho mais curto

Se você só quer ver o app rodando no seu celular, são quatro passos:

```bash
# 1. dependências (da raiz do repositório)
pnpm install

# 2. configuração
cp apps/mobile/.env.example apps/mobile/.env

# 3. preencher EXPO_PUBLIC_LOGTO_APP_ID  — ver "O que depende de você", abaixo

# 4. subir o Metro
pnpm --filter @fatia/mobile start
```

Depois é abrir o **Expo Go** ([iOS](https://apps.apple.com/app/expo-go/id982107779) /
[Android](https://play.google.com/store/apps/details?id=host.exp.exponent)) e ler
o QR Code que aparece no terminal. O celular e o computador precisam estar na
mesma rede.

Sem emulador, sem Xcode, sem Android Studio. Todos os módulos nativos que o app
usa já vêm no Expo Go.

---

## O que depende de você

Duas coisas eu não consigo fazer daqui. As duas são rápidas.

### 1. Criar a Application "Native" no Logto

O PWA usa uma Application do tipo **Traditional Web** — o token fica no servidor
dele. O app nativo não tem servidor, então precisa de uma Application do tipo
**Native**, que é pública (sem `client_secret`) e exige PKCE.

No console do Logto (`https://logto-admin.fat.ia.br` em produção,
`http://localhost:3002` no ambiente local):

1. **Applications → Create application → Native**
2. Nome: `Fatia Mobile`
3. Em **Redirect URIs**, cadastre:
   ```
   fatia://auth/callback
   ```
4. Em **Post sign-out redirect URIs**, o mesmo valor
5. Copie o **App ID** e cole em `apps/mobile/.env`:
   ```
   EXPO_PUBLIC_LOGTO_APP_ID=<o-app-id>
   ```

> **Rodando no Expo Go, cadastre um redirect a mais.** O Expo Go não usa
> `fatia://` — ele usa um endereço `exp://` com o IP da sua máquina, que muda de
> rede para rede. Ao tocar em "Entrar", o app imprime no terminal do Metro a
> linha `[auth] redirect_uri: ...`. Copie exatamente esse valor e acrescente-o
> aos Redirect URIs da Application. Um *development build* (abaixo) dispensa
> isso, porque aí o `fatia://` vale de verdade.

### 2. Contas de desenvolvedor, só para distribuir

Apple Developer (US$ 99/ano) e Google Play (US$ 25, uma vez) são necessárias
apenas para gerar build assinado e distribuir por TestFlight / faixa interna.
Para rodar localmente, não.

---

## Configuração

`apps/mobile/.env` (copiado de `.env.example`):

| Variável                     | O que é                                | Padrão do exemplo            |
| ---------------------------- | -------------------------------------- | ---------------------------- |
| `EXPO_PUBLIC_API_URL`        | base da API                            | `https://api.fat.ia.br`      |
| `EXPO_PUBLIC_LOGTO_ENDPOINT` | servidor OIDC                          | `https://auth.fat.ia.br`     |
| `EXPO_PUBLIC_LOGTO_AUDIENCE` | identificador do recurso (audience)    | `https://api.fat.ia.br`      |
| `EXPO_PUBLIC_LOGTO_APP_ID`   | App ID da Application Native           | **vazio — você preenche**    |

Tudo em `EXPO_PUBLIC_*` é inlinado no bundle e legível por quem baixar o app.
**Nenhum segredo entra aí.** O App ID do Logto é público por desenho: cliente
nativo não tem segredo, e é exatamente por isso que o fluxo exige PKCE.

O app avisa quando falta configuração — a tela de login lista as variáveis
ausentes em vez de mostrar um botão que não faz nada.

> Mexeu no `.env`? **Reinicie o Metro.** As variáveis são resolvidas em tempo de
> bundle; recarregar o app não basta.

---

## Rodando contra o backend local

Por padrão o `.env.example` aponta para produção, que é o caminho mais curto para
ver o app funcionando. Para desenvolver contra a stack local:

```bash
# na raiz: sobe Postgres + Logto e a API
pnpm infra:up
pnpm dev
```

Depois, em `apps/mobile/.env`, troque `localhost` pelo **IP da sua máquina na
rede local** — o celular não enxerga o `localhost` do computador:

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
EXPO_PUBLIC_LOGTO_ENDPOINT=http://192.168.0.10:3001
EXPO_PUBLIC_LOGTO_AUDIENCE=http://localhost:3000
```

Repare que `EXPO_PUBLIC_LOGTO_AUDIENCE` **continua com `localhost`**: ele não é
uma URL a ser acessada, é o identificador do recurso registrado no Logto, e o
match é exato. Trocar para o IP faz o Logto recusar com `invalid_target`.

Descubra seu IP com `ip addr` (Linux), `ipconfig getifaddr en0` (macOS) ou
`ipconfig` (Windows).

---

## Emulador e simulador

Se você preferir emulador ao aparelho:

```bash
pnpm --filter @fatia/mobile android   # emulador Android (precisa de Android Studio)
pnpm --filter @fatia/mobile ios       # simulador iOS (precisa de Xcode, só macOS)
```

Com o Metro rodando, as teclas `a` e `i` fazem o mesmo.

---

## Development build

Necessário quando você quiser o deep link `fatia://` de verdade, ou testar algo
que o Expo Go não cobre:

```bash
pnpm --filter @fatia/mobile exec eas build --profile development --platform android
```

Instale o `.apk` gerado e rode `pnpm --filter @fatia/mobile start --dev-client`.

Exige conta Expo (gratuita) e `eas init` uma vez, que grava o `projectId`.

---

## Verificação

```bash
pnpm --filter @fatia/mobile typecheck
pnpm --filter @fatia/mobile lint
pnpm --filter @fatia/mobile test
pnpm --filter @fatia/mobile build    # bundle JS de iOS e Android, sem toolchain nativa
```

Os quatro rodam no CI a cada PR. O `build` é `expo export`: empacota o JavaScript
dos dois sistemas e não precisa de credencial de EAS — serve para pegar import
quebrado antes de alguém instalar o app.

Os testes cobrem **lógica pura**: ciclo de vida do token, escalas dos gráficos, e
uma guarda que compara token a token a paleta do app com a do PWA. Não há teste
de renderização — a verificação de interface é a
[auditoria de paridade](../../docs/MOBILE_PARITY.md), feita em aparelho.

---

## Quando der errado

| Sintoma                                              | Causa provável                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tela de login diz "Configuração incompleta"          | falta `.env`, ou o Metro não foi reiniciado depois de editá-lo                                              |
| Login abre o navegador e volta com `invalid_redirect_uri` | o redirect não está cadastrado no Logto. Veja a linha `[auth] redirect_uri:` no terminal do Metro e cadastre-a |
| Login volta, mas toda tela dá erro de sessão         | `EXPO_PUBLIC_LOGTO_AUDIENCE` diferente do `LOGTO_AUDIENCE` da API — o match é exato, inclusive barra final   |
| QR Code não conecta                                  | celular e computador em redes diferentes, ou firewall bloqueando a porta 8081                               |
| `Unable to resolve module` depois de trocar de branch | `pnpm install` e depois `pnpm --filter @fatia/mobile start --clear`                                          |
| Estilo não aplica (tela sem cor)                     | cache do Metro. `pnpm --filter @fatia/mobile start --clear`                                                  |

---

## Estrutura

```
apps/mobile/
  app/                  rotas (Expo Router, roteamento por arquivo)
    _layout.tsx         providers: gesto, safe area, auth, react-query
    login.tsx
    (app)/              grupo autenticado — guarda de sessão + bottom nav
  src/
    api/transport.ts    liga @fatia/api-client à sessão do aparelho
    auth/               OIDC, cofre do sistema, ciclo de vida do token
    components/
      ui/               as 8 primitivas (button, card, input, label, tabs,
                        form, drawer, carousel) + estados de tela
      layout/           top bar, bottom nav, moldura de tela
      charts/           kit de gráficos em react-native-svg (ADR 012)
      ...               um diretório por área do produto
    env.ts              configuração vinda do ambiente, validada
  global.css            paleta — espelho de apps/web/src/app/globals.css
```

As chamadas de API e os tipos **não vivem aqui**: vêm de
[`packages/api-client`](../../packages/api-client), compartilhado com o PWA. Se
uma tela precisar de um endpoint novo, ele entra lá, não num `fetch` local.

## Documentos relacionados

- [ADR 012 — gráficos com react-native-svg](../../docs/ADR/012-graficos-no-mobile.md)
- [Threat model, vetor 7](../../docs/THREAT_MODEL.md) — o que muda quando o token passa a viver no aparelho
- [Auditoria de paridade com o PWA](../../docs/MOBILE_PARITY.md)
- [Runbook de release](../../docs/OPERATIONS.md)
