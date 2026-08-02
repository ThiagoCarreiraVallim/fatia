# Operações e recuperação de desastre

> Entregável da issue #93 (frente 3 da épica #38). Escrito para ser seguido por alguém que
> **não** é o mantenedor — se um passo exige conhecimento que só está na cabeça de uma pessoa, o
> runbook falhou.
>
> Observabilidade: seção [Observabilidade](#observabilidade) (issue #39). Retenção de dados em
> [`DATA_RETENTION.md`](./DATA_RETENTION.md).

## Topologia

| Componente     | Onde                                       | Notas                                         |
| -------------- | ------------------------------------------ | --------------------------------------------- |
| Site + landing | container nginx, mesmo compose             | Astro estático (`apps/site`), sem Node nem JS |
| API (NestJS)   | container, `infra/docker-compose.prod.yml` | Aplica migrations no boot                     |
| PWA (Next.js)  | container, mesmo compose                   | —                                             |
| Logto          | container, mesmo compose                   | IdP (ADR 008)                                 |
| Postgres       | "Database" do Dokploy, **fora** do compose | **Dois** clusters: `fatia` e `logto`          |
| Traefik        | gerenciado pelo Dokploy                    | TLS via Let's Encrypt, `dokploy-network`      |
| Backups        | `infra/backup.sh` via cron no host         | Local + offsite opcional                      |

| Host             | Serviço                                |
| ---------------- | -------------------------------------- |
| `fat.ia.br`      | site institucional + `/claude-connect` |
| `www.fat.ia.br`  | redireciona para o apex                |
| `app.fat.ia.br`  | PWA                                    |
| `api.fat.ia.br`  | API + endpoint MCP em `/mcp`           |
| `auth.fat.ia.br` | Logto                                  |

Todos com redirect HTTP→HTTPS.

## Observabilidade

Auto-hospedado, sem nenhuma conta externa: OpenTelemetry na API, e Grafana + Tempo + Loki +
Prometheus num compose separado. Entregue pela issue #39.

### Onde vive cada coisa

| Sinal   | Onde fica  | Retenção | Responde a                                          |
| ------- | ---------- | -------- | --------------------------------------------------- |
| Trace   | Tempo      | 3 dias   | "onde esta requisição gastou o tempo"               |
| Log     | Loki       | 7 dias   | "o que aconteceu nesta requisição", com stack trace |
| Métrica | Prometheus | 15 dias  | "como está o conjunto" — taxa, latência, erro       |
| Painel  | Grafana    | —        | os três acima, com link cruzado                     |

Retenções curtas de propósito: os três dividem disco com o Postgres, e **disco cheio derruba o
banco e o `backup.sh` junto**. Prometheus tem, além do limite de tempo, um limite de 2 GB.

**A API não expõe `/metrics`.** Ela empurra OTLP para o collector, e é o collector que apresenta
as séries para o Prometheus raspar. Consequência boa: não existe rota de métrica para publicar
na internet por engano ao copiar labels de Traefik de um serviço vizinho.

### Como os três sinais se ligam

Todo log emitido dentro de uma requisição carrega `trace_id` e `span_id`, injetados pelo
`@opentelemetry/instrumentation-pino`. É por esse campo que se atravessa:

1. **Achei um erro no painel de logs** → o campo `TraceID` da linha é um link → abre o trace no
   Tempo.
2. **Estou olhando um trace lento** → botão "Logs for this span" → volta ao Loki filtrado por
   aquele `trace_id`.
3. **A métrica mostra p95 alto numa rota** → o painel de latência tem link para a métrica da
   rota; o trace da requisição concreta vem pelo caminho 1.

### Subir localmente

```bash
docker compose -f infra/docker-compose.observability.yml up -d

# a API só exporta quando a variável está preenchida
echo 'OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318' >> .env
pnpm --filter @fatia/api dev
```

Grafana em <http://localhost:3300> (`admin`/`admin`), dashboard **Fatia — API** na pasta
`Fatia`. Datasources e dashboard vêm de arquivo — não há passo de clicar em nada.

Para conferir que está entrando dado:

```bash
curl -s localhost:3000/api/nutrition/meals   # 401 serve: gera trace, log e métrica
# no Grafana → Explore → Loki → {service_name="fatia-api"}
```

Derrubar sem apagar o histórico: `docker compose -f infra/docker-compose.observability.yml down`
(com `-v` os volumes vão junto).

### Subir no Dokploy

Um **segundo Compose service** no mesmo projeto, separado da aplicação: o ciclo de deploy da
observabilidade não deve derrubar a API, e vice-versa.

1. **Criar o Compose service** no painel, apontando para o repositório, com os dois arquivos:

   ```
   infra/docker-compose.observability.yml
   infra/docker-compose.observability.dokploy.yml
   ```

   A sobreposição `.dokploy.yml` faz três coisas: coloca collector e Grafana na
   `dokploy-network`, publica o Grafana em `grafana.${DOMAIN}` com TLS, e **remove as portas
   publicadas no host** — nada deste stack escuta na interface pública.

2. **Variáveis de ambiente** do Compose service:

   ```bash
   DOMAIN=fat.ia.br
   GRAFANA_USER=admin
   GRAFANA_PASSWORD=<gerar com: openssl rand -base64 24>
   ```

   ⚠️ Trocar a senha do Grafana **antes** do primeiro deploy. Este Grafana lê log de produção;
   com `admin/admin` num subdomínio público, o dado de saúde de todo mundo fica a um palpite.

3. **Apontar o DNS** de `grafana.${DOMAIN}` para o mesmo IP e deployar. O Traefik pede o
   certificado no primeiro acesso.

4. **Ligar a exportação na API.** No Compose service da aplicação, acrescentar:

   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
   OTEL_SERVICE_NAME=fatia-api
   ```

   O nome do host é o do serviço no compose da observabilidade — os dois estão na
   `dokploy-network`. Se o Dokploy prefixar o nome do container, use o nome que aparece em
   `docker ps`. Redeployar a API depois de acrescentar.

5. **Conferir**, do host:

   ```bash
   # 1. a API está exportando?
   docker logs <container-da-api> 2>&1 | grep -o 'trace_id":"[a-f0-9]*' | head -3
   # 2. o log chegou ao Loki? (pelo Grafana → Explore → Loki)
   #    {service_name="fatia-api"}
   # 3. a métrica chegou ao Prometheus?
   #    sum by (http_route) (rate(http_server_request_duration_seconds_count{job="fatia-api"}[5m]))
   # 4. /metrics NÃO responde de fora — tem de dar 404:
   curl -o /dev/null -w '%{http_code}\n' https://api.fat.ia.br/metrics
   ```

   Se o passo 1 não mostrar `trace_id`, a variável não chegou ao processo. É o modo de falha
   mais comum, e é silencioso: a API funciona normalmente, só não exporta nada.

### O que cada painel significa, e o que fazer

| Painel                  | Quando incomodar                  | Primeira ação                                                  |
| ----------------------- | --------------------------------- | -------------------------------------------------------------- |
| Taxa de erro 5xx        | acima de 1%                       | painel de logs de erro, seguir o `TraceID` da primeira linha   |
| Latência p95 por rota   | subiu e não voltou                | abrir um trace da rota; procurar o span que domina o tempo     |
| Requisições por segundo | caiu a zero com o serviço "no ar" | Traefik ou DNS, não a API — `/health` de fora                  |
| Chamadas de tool MCP    | uma tool com pico de falha        | painel de falhas por categoria; `NOT_FOUND` ≠ `INTERNAL`       |
| Logs de erro            | qualquer `level=error` novo       | é o substituto do Sentry — o stack trace está na própria linha |

### Lacunas declaradas — o que isto **não** cobre

Escritas aqui de propósito. Lacuna suposta coberta é pior que lacuna conhecida.

- **Não há alerta configurado.** O Grafana tem o motor de alerta, mas nenhuma regra nem contact
  point foi criada nesta entrega: regra apontando para contact point vazio é o pior dos mundos,
  porque parece coberto. Enquanto não houver, **o painel só avisa quem estiver olhando**. O
  único aviso automático que existe hoje é o do backup (`ALERT_WEBHOOK` + `BACKUP_PING_URL`).
- **Observabilidade no mesmo host que a aplicação.** Se o VPS morrer, o Grafana morre junto e
  não sobra registro do que aconteceu nos minutos finais. Mesma lacuna do Uptime Kuma, descrita
  na seção do `BACKUP_PING_URL`.
- **Sem uptime externo.** Nada aqui detecta o host inteiro sumir — detectar isso sem conta
  externa exige algo fora do host, e não existe.
- **Prisma não está instrumentado.** Não há span de query no banco: ligar `@prisma/instrumentation`
  exige mexer no `schema.prisma`, que estava fora do escopo desta entrega. Latência de banco
  aparece hoje como tempo dentro do span do controller, sem detalhe da query.
- **Só a API é instrumentada.** `apps/web`, `apps/mobile` e `apps/site` estão fora.

### Custo de recursos, medido

Medido nesta máquina com o stack completo e a API sob carga leve, depois de estabilizar:

| Container      | Memória em uso | Limite  |
| -------------- | -------------- | ------- |
| otel-collector | 148 MiB        | 192 MiB |
| tempo          | 186 MiB        | 256 MiB |
| grafana        | 109 MiB        | 256 MiB |
| loki           | 62 MiB         | 256 MiB |
| prometheus     | 46 MiB         | 256 MiB |
| **total**      | **~550 MiB**   | 1,2 GiB |

Some ~2,4 GB de imagem em disco (o Grafana sozinho é 1,16 GB) e os volumes, que ficaram na casa
de dezenas de MB nas primeiras horas.

Todos os cinco são Go, e **o GC do Go não enxerga o limite do cgroup**: sem `GOMEMLIMIT` ele
cresce até o dobro do heap vivo e o container morre pelo OOM killer, sem log de causa. Medido: o
Tempo estacionava em 91% do limite sem a variável e em 72% com ela. Ela está definida no compose
a ~75% de cada `limits.memory`.

**Num VPS de 2 GB o stack não cabe** junto com API (512 MB), PWA (384 MB), Logto (512 MB) e
Postgres. A partir de 4 GB cabe com folga. Se for preciso recortar, a ordem de corte é: primeiro
o **Tempo** (o trace só passa a valer de verdade quando o `apps/agent` da ADR 015 subir e houver
dois processos no caminho de uma requisição), depois o **Loki** — que economiza ~250 MiB e ainda
deixa métrica, painel e o `docker logs` com rotação.

## Backup — setup do zero

Tudo abaixo roda **no host**, via SSH. Leva ~15 minutos, quase todo em criar o bucket.

### 1. Criar o bucket

No **Backblaze B2** (mais barato para este volume) ou **Cloudflare R2** (sem taxa de egresso):

- crie um bucket **privado** chamado `fatia-backups`
- gere uma chave de aplicação com acesso **só a esse bucket**
- anote `keyID`, `applicationKey` e o **endpoint S3** do bucket

### 2. Instalar as dependências no host

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y gnupg awscli
```

### 3. Gerar a passphrase

```bash
openssl rand -base64 32
```

> ⚠️ **Guarde esta passphrase no seu gerenciador de senhas ANTES de continuar.**
> Se ela existir apenas no VPS e o VPS morrer, os backups offsite viram lixo cifrado —
> você terá todas as cópias e não conseguirá abrir nenhuma. É o erro mais fácil de
> cometer e o mais caro de descobrir tarde.

### 4. Configurar

```bash
cd /opt/fatia
cp infra/.env.backup.example infra/.env.backup
nano infra/.env.backup          # preencher passphrase, bucket, chaves, webhook, ping
chmod 600 infra/.env.backup     # credenciais: só o dono lê
chmod +x infra/backup.sh
```

⚠️ O Fatia roda **dois clusters Postgres separados**: um da aplicação e um do Logto (contas
de usuário). `pg_dumpall` cobre todos os databases de **um** cluster — não os dois. Descubra os
dois nomes e preencha `PG_INSTANCES`:

```bash
docker ps --format '{{.Names}}' | grep -iE 'postgres|logto'
```

```bash
PG_INSTANCES="fatia:<container-da-app>:postgres logto:<container-do-logto>:postgres"
```

Dumpar só um traria os dados sem as contas (ou o contrário), e isso só apareceria na hora do
restore. Se qualquer instância falhar, o backup inteiro falha.

O `backup.sh` carrega o `.env.backup` sozinho — não é preciso repetir variável nenhuma
na crontab (e credencial em crontab ficaria legível por qualquer `crontab -l`).

### 5. Rodar uma vez na mão

```bash
/opt/fatia/infra/backup.sh
```

Esperado: `Dump OK`, `Cifrando com AES-256`, `Offsite OK`, `Concluído`. Se algum passo
falhar, o script sai com código 1 e dispara o `ALERT_WEBHOOK`.

### 6. Agendar

```bash
crontab -e
```

```cron
0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
```

### 7. Confirmar que o alerta funciona

Vale testar antes de precisar. Rode apontando para um container inexistente:

```bash
PG_INSTANCES="fatia:nao-existe:postgres" /opt/fatia/infra/backup.sh; echo "exit=$?"
```

Variável passada na linha de comando tem precedência sobre o `.env.backup` — o script guarda os
valores vindos do ambiente e os reaplica depois de carregar o arquivo. Sem esse cuidado o
`. arquivo` sobrescreveria o que você passou, e este teste rodaria um backup **normal**: você
concluiria que o alerta funciona sem nunca tê-lo exercitado.

Deve sair `exit=1` e o webhook deve receber a notificação.

### 8. Configurar o ping de sucesso — `BACKUP_PING_URL`

#### Por que isto existe, se já tem o `ALERT_WEBHOOK`

Porque os dois cobrem modos de falha diferentes, e o que o webhook **não** cobre é o pior.

O `ALERT_WEBHOOK` só dispara quando o `backup.sh` roda, falha e chama `fail()`. Ele depende de
haver uma execução para reportar. O modo de falha que ninguém percebe é o oposto: **o backup que
nunca rodou.**

- alguém editou a crontab e apagou a linha
- o host reiniciou e o cron não voltou
- o disco encheu antes do script começar
- o arquivo perdeu o bit de execução num deploy

Em todos esses casos não existe erro para reportar, porque não existiu execução. O `fail()` nunca
roda, o canal do webhook fica calado — e um canal calado é indistinguível de "está tudo bem".
É assim que se descobre, meses depois, que o último backup é de fevereiro.

O `BACKUP_PING_URL` inverte a lógica. O script avisa **"rodei e deu certo"**, e é a **ausência**
do aviso, do outro lado, que dispara o alerta. Um dead-man's switch. Ninguém precisa lembrar de
conferir nada.

Os dois são complementares, não alternativas. O webhook de falha carrega **a mensagem** (`nenhum
container casa com o prefixo 'nao-existe'`), que é o que economiza tempo às 4 da manhã; o ping só
sabe dizer que não chegou. Mantenha os dois preenchidos.

#### Apontar para um Uptime Kuma auto-hospedado

Sem conta externa, coerente com a decisão de observabilidade da #39:

1. No Uptime Kuma, **Add New Monitor** → **Monitor Type: `Push`**.
2. Nome: `fatia-backup`.
3. **Heartbeat Interval**: `93600` segundos (26 h). O backup roda às 04:00, então a janela precisa
   ser 24 h **mais folga** para a duração real do backup. Curto demais gera falso alarme, e falso
   alarme repetido é treinamento para ignorar o canal.
4. **Retries**: `0`. Não há o que retentar — ou o ping do dia chegou, ou não chegou.
5. Configure a notificação do monitor (o mesmo canal do `ALERT_WEBHOOK` serve).
6. Copie a **Push URL** que o Kuma mostra e cole no `.env.backup`:

```bash
BACKUP_PING_URL=https://kuma.seu-host/api/push/<token>
```

O script faz um `GET` simples. O Kuma aceita parâmetros opcionais (`?status=up&msg=...`) se você
quiser um texto no painel, mas nada disso é necessário.

Qualquer endpoint que aceite `GET` serve — é uma URL, não um SDK. Trocar depois para
Healthchecks.io ou outro destino é editar esta linha, e só.

#### Confirmar

```bash
/opt/fatia/infra/backup.sh
```

O monitor deve sair de **pending** para **up**. Se não sair, o log traz
`AVISO: ping de sucesso não foi entregue` — o backup em si continua tendo dado certo, porque um
ping que falha **não** derruba o backup (seria um alerta de falha para um backup correto).

Agora prove que o ping **não** é enviado quando o backup falha:

```bash
PG_INSTANCES="fatia:nao-existe:postgres" /opt/fatia/infra/backup.sh; echo "exit=$?"
```

`exit=1`, o `ALERT_WEBHOOK` recebe a notificação de falha e o monitor do Kuma **não** recebe nada.
O ping fica no fim do script, depois da verificação de tamanho e integridade de cada dump, do
upload offsite e da retenção. Pingar antes de verificar seria anunciar sucesso de um dump
possivelmente truncado — pior que não pingar, porque transforma o monitor em falso conforto.

E o teste que realmente prova o valor, o único que não dá para pular: **desligue o cron e deixe a
janela vencer.** Os testes acima só provam que a URL está certa. Só este prova que o dead-man's
switch dispara sozinho.

> ⚠️ **Lacuna declarada:** um Uptime Kuma rodando **no mesmo host** que o backup morre junto com
> o VPS — perda total do host leva o monitor e o backup ao mesmo tempo, e ninguém é avisado.
> Hospedar o Kuma em outra máquina, ou aceitar um serviço externo (Healthchecks.io), fecha essa
> lacuna. Enquanto não fechar, ela está **declarada**, não suposta coberta.

### 9. Executar o primeiro drill de restore

Seção seguinte. **Enquanto isso não acontecer, você não tem backup — tem esperança.**

O passo continua aqui porque vale para **todo host novo**: um drill feito no servidor antigo não
diz nada sobre a restauração no novo. No host atual ele já foi executado em 01/08/2026, com os
dados conferidos — ver [Histórico de drills](#histórico-de-drills).

### Garantias do script

- Aborta se o dump sair com menos de 1 KB ou se o gzip não passar no teste de integridade — dump
  truncado passa desapercebido até a hora do restore.
- **Recusa enviar offsite sem cifra.** Sem `BACKUP_PASSPHRASE`, o upload não acontece.
- Confirma que o objeto existe no bucket depois do upload; `cp` com sucesso não é prova quando o
  endpoint é S3-compatível de terceiro.
- Sai com código 1 em qualquer falha e chama `ALERT_WEBHOOK`.
- Sem `S3_BUCKET`, avisa em log que o backup só existe naquele host.
- Pinga `BACKUP_PING_URL` **só no fim**, depois de tudo verificado — e um ping que falhe nunca
  derruba um backup que deu certo. Com a variável vazia, o comportamento é no-op silencioso.

## Drill de restore

**Backup não testado não conta.** Rode este drill ao configurar e a cada trimestre. Anote a
data e o tempo na tabela no fim deste doc.

Faça em **container descartável**, nunca contra produção:

```bash
# 1. Postgres temporário
docker run -d --rm --name fatia-restore-test \
  -e POSTGRES_USER=fatia -e POSTGRES_PASSWORD=temp \
  -p 55432:5432 postgres:16-alpine
sleep 5

# 2. Baixar o backup do offsite. São DOIS arquivos por execução, um por cluster:
#    fatia-fatia-<TS> (aplicação) e fatia-logto-<TS> (contas). Restaure os dois.
aws --endpoint-url "$S3_ENDPOINT" s3 cp \
  "$S3_BUCKET/fatia-fatia-YYYYMMDD-HHMMSS.sql.gz.gpg" /tmp/restore-app.sql.gz.gpg

# 3. Decifrar, descomprimir e restaurar
printf '%s' "$BACKUP_PASSPHRASE" \
  | gpg --batch --quiet --passphrase-fd 0 --decrypt /tmp/restore-app.sql.gz.gpg \
  | gunzip \
  | docker exec -i fatia-restore-test psql -U fatia

# 4. Verificar que os dados chegaram — não basta o psql não reclamar
docker exec fatia-restore-test psql -U fatia -d fatia -c \
  'SELECT (SELECT count(*) FROM "User") AS users,
          (SELECT count(*) FROM "Meal") AS meals,
          (SELECT count(*) FROM "WorkoutSession") AS sessions;'

# 5. Limpar
docker stop fatia-restore-test
rm -f /tmp/restore-test.sql.gz.gpg
```

Se as contagens vierem zeradas ou muito abaixo do esperado, **o backup não serve** — investigue
antes de precisar dele.

Para backup local não cifrado, pule o passo 2 e o `gpg`:

```bash
gunzip -c /opt/fatia/backups/fatia-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i fatia-postgres psql -U fatia
```

## Cenário 1 — perda total do VPS

Tempo estimado: **1 a 2 horas**, dominado por propagação de DNS e emissão de certificado.

1. **Provisionar host novo** com Docker e Dokploy. Ver `infra/dokploy/README.md`.
2. **Apontar o DNS** do apex (`fat.ia.br`) e dos subdomínios (`api.`, `app.`, `auth.`, `www.`)
   para o novo IP. Faça isto cedo — a propagação corre em paralelo com o resto.
3. **Criar o Postgres** como Database do Dokploy, com os dois clusters: um para `fatia` e um para `logto`.
4. **Restaurar os dois dumps** mais recentes do offsite (passos 2 e 3 do drill, mirando os
   Postgres novos). São arquivos separados — `fatia-fatia-<TS>` para a aplicação e
   `fatia-logto-<TS>` para as contas — porque são **dois clusters distintos**.
   ⚠️ Restaurar só o da aplicação devolve os dados sem nenhuma conta: todo mundo perde o acesso
   ao próprio histórico. Restaurar só o do Logto devolve as contas vazias. Os dois, sempre.
5. **Recriar o Compose service** apontando para `infra/docker-compose.prod.yml`.
6. **Repor as variáveis de ambiente** no painel do Dokploy (ver `.env.production.example`).
   Precisam ser as **mesmas** de antes, em especial `LOGTO_COOKIE_SECRET` — trocá-la invalida as
   sessões do PWA.
7. **Deploy.** A API aplica migrations no boot; o dump restaurado já está na versão correta, então
   é no-op.
8. **Confirmar o TLS.** O Traefik pede certificado ao Let's Encrypt no primeiro acesso a cada
   subdomínio. Se falhar, quase sempre é DNS ainda não propagado — espere e tente de novo, com
   atenção ao rate limit do Let's Encrypt.
9. **Reinstalar o cron de backup** e rodar `backup.sh` na mão uma vez.
10. **Smoke test:**
    - `curl https://api.fat.ia.br/health`
    - `curl https://api.fat.ia.br/.well-known/oauth-authorization-server`
    - `curl -I https://fat.ia.br/claude-connect/`
    - Login no PWA
    - Conectar o Fatia no Claude e pedir uma leitura (ver [`MCP_OAUTH.md`](./MCP_OAUTH.md))

## Cenário 2 — corrupção de dados, host íntegro

1. **Parar a API** para não haver escrita durante o restore.
2. Tirar um dump do estado atual, mesmo corrompido — ele pode conter dados posteriores ao último
   backup que você vai querer garimpar depois.
3. Restaurar o último backup bom (o `pg_dumpall` usa `--clean --if-exists`, então recria os
   objetos).
4. Subir a API e conferir.

Perda de dados esperada: até 24 h (o backup é diário às 4h).

## Cenário 3 — vazamento de credencial

Rotacione, na ordem:

1. **Senha do Postgres** — no Dokploy, e depois `DATABASE_URL` no ambiente.
2. **`LOGTO_MCP_APP_SECRET`** — console do Logto e ambiente. Ver a seção de rotação em
   [`MCP_OAUTH.md`](./MCP_OAUTH.md): não desconecta quem já está conectado.
3. **`LOGTO_APP_SECRET`** (app do PWA) — console e ambiente.
4. **`LOGTO_COOKIE_SECRET`** — trocar **derruba todas as sessões do PWA**. Faça se houver
   suspeita de sessão comprometida; os usuários só precisam logar de novo.
5. **`BACKUP_PASSPHRASE`** — trocar não recifra os backups antigos. Mantenha a antiga arquivada
   enquanto houver backup cifrado com ela dentro da janela de retenção.
6. **Credenciais S3** — no provedor e no ambiente.
7. **`LOGTO_M2M_APP_SECRET`**, se configurado.

Depois: `docker compose up -d --force-recreate` para todo container ler as variáveis novas.

Se houver suspeita de acesso indevido a dados de usuário, considere as obrigações de comunicação
da LGPD (art. 48) — ANPD e titulares afetados.

## Cenário 4 — Logto indisponível

A API valida JWT via JWKS com cache. Com o Logto fora:

- **Quem já tem token válido continua funcionando** até ele expirar.
- **Login novo e refresh param.**

Não há fallback, e é uma dependência aceita conscientemente na ADR 008. Restaurar o Logto é a
única saída: `docker compose logs logto` e confirmar que ele alcança a database `logto`.

## Release do app nativo

O app (`apps/mobile`) não vai junto do deploy do backend — a distribuição é pelas
lojas, com ciclo próprio. O que segue é o runbook; o passo a passo de ambiente local
está em [`apps/mobile/README.md`](../apps/mobile/README.md).

### Pré-requisitos, uma vez só

| O quê                       | Onde                                 | Custo           |
| --------------------------- | ------------------------------------ | --------------- |
| Conta Expo                  | expo.dev                             | grátis          |
| `eas init` no projeto       | grava `projectId` em `app.config.ts` | —               |
| Apple Developer Program     | developer.apple.com                  | US$ 99/ano      |
| Google Play Console         | play.google.com/console              | US$ 25, uma vez |
| Application Native no Logto | console do Logto                     | —               |

**Nenhuma credencial de assinatura entra no repositório.** Certificados e keystores
são geridos pelo EAS (`eas credentials`). O `eas.json` versionado tem só perfis de
build e variáveis públicas (`EXPO_PUBLIC_*`), que vão inlinadas no bundle e são
legíveis por qualquer pessoa que baixe o app de qualquer forma.

### Perfis

| Perfil        | Para quê                              | Distribuição      | Artefato Android |
| ------------- | ------------------------------------- | ----------------- | ---------------- |
| `development` | dev client, deep link `fatia://` real | interna           | `.apk`           |
| `preview`     | testar antes de publicar              | interna           | `.apk`           |
| `production`  | loja                                  | TestFlight / Play | `.aab`           |

### Publicar

```bash
cd apps/mobile

# 1. build
eas build --profile production --platform all

# 2. enviar para as lojas
eas submit --profile production --platform ios      # → TestFlight
eas submit --profile production --platform android  # → faixa interna do Play
```

`autoIncrement` no perfil de produção cuida do build number; a versão que a pessoa
vê é a `version` do `app.config.ts`, e sobe junto do resto do monorepo.

### Antes de apertar o botão

- [ ] `pnpm --filter @fatia/mobile typecheck lint test build` passando
- [ ] Redirect URI da Application Native do Logto conferido — errar aqui só aparece
      no primeiro login em produção, depois do app já instalado
- [ ] `EXPO_PUBLIC_LOGTO_AUDIENCE` idêntico ao `LOGTO_AUDIENCE` da API, inclusive
      barra final: o Logto faz match exato e recusa com `invalid_target`
- [ ] Apagar conta funciona de dentro do app — Apple e Google **rejeitam** app que
      permite criar conta e não permite apagá-la
- [ ] [Auditoria de paridade](./MOBILE_PARITY.md) sem linha pendente

### Quando um build quebra e o backend não

O app instalado continua falando com a API antiga. Mudança quebrando contrato na API
derruba **todas as versões já instaladas**, que não atualizam sozinhas como o PWA. Na
prática: a API não pode remover campo nem endpoint sem antes checar a versão mínima
em circulação.

## Checklist trimestral

- [ ] Drill de restore executado e anotado abaixo
- [ ] `BACKUP_PASSPHRASE` confirmada fora do VPS
- [ ] Log de backup sem falhas nos últimos 90 dias
- [ ] Ping de sucesso recebido nos últimos 7 dias (monitor `fatia-backup` em **up**) — um monitor
      parado em "pending" há semanas significa que o backup não roda desde então
- [ ] Validade dos certificados TLS
- [ ] Espaço em disco no host
- [ ] Backups offsite presentes e dentro da retenção configurada

## Histórico de drills

Preencher a cada execução. Uma linha vazia aqui significa que o backup **nunca foi testado**.

| Data       | Executado por | Backup usado                         | Tempo até restaurado | Resultado                                                           |
| ---------- | ------------- | ------------------------------------ | -------------------- | ------------------------------------------------------------------- |
| 01/08/2026 | Thiago        | dump do offsite (R2), do `backup.sh` | não cronometrado     | ✅ Restaurado e **dados conferidos** — primeiro drill, na Hostinger |

> O tempo não foi cronometrado nesta execução. Anote-o nas próximas: é o único dado da tabela que
> não dá para reconstruir depois, e é ele que diz quanto tempo o "Cenário 1 — perda total do VPS"
> realmente leva. Sem esse número, o roteiro do cenário 1 tem passos mas não tem duração.
