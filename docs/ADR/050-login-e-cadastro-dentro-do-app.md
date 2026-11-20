# ADR 050 — Login, cadastro e "esqueci a senha" dentro do app

**Status:** Accepted
**Data:** 2026-11-19
**Revê:** parte da [ADR 008](./008-logto-oidc-provider.md) (a senha só na tela do Logto)

## Contexto

Pela ADR 008 o app abria o navegador do sistema na tela do Logto para entrar, criar conta e
recuperar a senha. A tela da conta do app (Onb-01a/01b) pedia nome e e-mail, e o Logto pedia tudo
de novo. O dono do produto decidiu: **cadastro com nome, e-mail e senha e login com e-mail e senha
em telas do app, sem passar pela tela do Logto**.

Havia um segundo problema. O access token do Logto não traz `email` nem `name`. Sem o app M2M da
Management API (que a produção não tem), toda conta nascia como `<sub>@logto.local`, com o `sub` no
lugar do nome — o "e-mail aleatório" de que o usuário reclamou.

## Decisão

1. **Experience API do Logto (`/api/experience`)**, feita para sign-in nativo. O app:
   - abre a autorização OIDC por `fetch` (PKCE S256, `response_mode=form_post`, escopos
     `openid offline_access profile email`), e o cookie da interação fica no cookie jar nativo
     (`credentials: 'include'`, que o iOS exige);
   - roda verificar → identificar → perfil → `submit`, consente pelo próprio app (cliente
     first-party, como a tela do Logto faz) e lê `code` e `state` do HTML do `form_post`;
   - troca o `code` pelo token exatamente como antes.

   O `form_post` evita o último redirect para `fatia://`/`exp://`, que o `fetch` do React Native
   não segue nem devolve de forma confiável no iOS. A lógica fica em
   `packages/api-client/src/auth-experience.ts`, testada sem aparelho.

2. **Cadastro:** nome, e-mail e senha; o código de verificação do e-mail é digitado numa tela do
   app; o nome vai ao Logto (`extraProfile`) e ao perfil da Fatia. **Login:** e-mail e senha.
   **"Esqueci minha senha":** código no e-mail e senha nova no app; sem sessão, já entra.

3. **Regras de senha iguais às do Logto**, avisadas enquanto a pessoa digita, em português. A
   política vem da página pública do Logto (`/api/.well-known/sign-in-exp`); a checagem de
   vazamento (Have I Been Pwned) fica no Logto, e a mensagem volta traduzida.

4. **E-mail e nome reais pelo ID token.** Depois de cada login o app manda o ID token a
   `POST /users/me/identity`. A API confere assinatura (JWKS do Logto), `iss`, `aud` igual ao app
   mobile (`LOGTO_MOBILE_APP_ID`) e `sub` igual ao do access token; um ID token de outra conta
   responde 403 e nada é gravado. Grava o e-mail verificado e, se o nome ainda for o provisório, o
   nome. Quem está com `@logto.local` é corrigido no próximo login **com senha ou social**: uma
   sessão aberta pela versão antiga do app só pediu `openid offline_access`, e o ID token que o
   refresh devolve continua sem `email` e `name` até a pessoa sair e entrar de novo (ou até haver
   M2M, que lê o perfil no Logto).

5. **Google e Apple** continuam no navegador, só para o consentimento do provedor
   (`direct_sign_in`, sem a tela do Logto). O botão só aparece com o conector configurado, lido da
   mesma página pública do Logto.

6. **Com a Management API (M2M), e só com ela:** o nome editado no app vai ao Logto, e a troca de
   e-mail (senha atual + código no e-mail novo) fica disponível. Sem M2M as duas coisas degradam:
   o nome fica só na Fatia e a tela diz que a troca de e-mail não está disponível.

## O trade-off: a senha passa pelo app

A ADR 008 mantinha a senha fora do app: só a tela do Logto, no navegador do sistema, a via. Agora o
app recebe a senha digitada e a envia ao Logto. Um app malicioso já poderia imitar a tela de login;
o que muda é que o app legítimo também passa a manipular a senha, e um defeito nele a exporia.

Mitigações:

- a senha só trafega por TLS, direto do app para o Logto (ou para a API, na troca de e-mail, que a
  repassa ao Logto); nunca passa por outro servidor;
- nunca é registrada (nenhum log, nenhuma telemetria, nenhum `console.log`) nem guardada — nem no
  cofre do aparelho; o campo usa `secureTextEntry` e o preenchimento do gerenciador de senhas;
- o Logto continua dono do hash, da política de senha, do bloqueio por tentativas e do limite de
  requisições; a API tem limite por usuário nos endpoints de e-mail;
- a troca de e-mail pede a senha atual: com um access token roubado, não dá para trocar o e-mail e
  depois recuperar a senha;
- o login social continua no navegador do sistema: a senha do Google ou da Apple nunca passa pelo
  app.

## Consequências

### Positivas

- Uma tela só para criar conta e entrar; o nome é pedido uma vez.
- E-mail e nome reais sem a Management API.
- Funciona igual no Logto 1.30 (produção) e 1.36 (dev): conferido rodando os três fluxos contra os
  dois.

### Negativas

- Dependemos de uma API do Logto que é menos estável que o OIDC; um upgrade do Logto precisa
  rodar `pnpm vitest` do api-client e o roteiro de `TESTAR_O_APP.md`.
- O cadastro precisa do conector de e-mail (SMTP) no Logto: o Logto exige e-mail verificado para
  cadastro por e-mail.
- A web continua na tela do Logto (fora deste escopo).

### Neutras

- O redirect `fatia://auth/callback` continua cadastrado: o Logto confere, mas o login dentro do app
  nunca o abre.

## Alternativas consideradas

- **API cria o usuário pela Management API e depois token exchange:** exigiria M2M em produção e
  um app com `allowTokenExchange`, e a senha passaria pela API da Fatia. Rejeitada: a Experience
  API faz o mesmo sem M2M e sem a senha tocar o nosso servidor.
- **Password grant (ROPC):** o Logto não oferece.
- **WebView com a tela do Logto:** o app poderia ler o que se digita nela e a tela continuaria
  sendo a do Logto. Rejeitada.
