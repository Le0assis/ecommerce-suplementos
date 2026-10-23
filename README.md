# PULSO

Loja de suplementos para quem treina. Marca fictícia do Gustavo, feita para o público jovem no Brasil: pré-treino, whey, creatina, kits, Pix com desconto, boleto, cartão parcelado e frete por CEP.

Este arquivo é o caminho do zero até a loja aberta no navegador. Se você nunca programou, leia na ordem. Cada passo diz o que instalar, o comando e o que deve aparecer.

A documentação para quem vai evoluir o código está em [docs/](docs/README.md). O mapa para agentes de IA está em [AGENTS.md](AGENTS.md). As referências de mercado e o plano em 6 etapas estão em [docs/REQUISITOS-TECNICOS.md](docs/REQUISITOS-TECNICOS.md).

## Plano de entrega

O Gustavo aprovou seis etapas, cada uma numa branch e num pull request, empilhadas. Esta linha fecha a etapa 6, em cima das etapas 1 a 5.

Operação: `/admin` entra com o e-mail e a senha da conta criada na API (`pnpm --filter @pulso/db create-owner`). A senha não vai para o JavaScript. Na conta, “Baixar meus dados” gera um JSON sem a senha. “Apagar conta neste aparelho” tira o usuário deste navegador. O guia de publicação está em [docs/deploy.md](docs/deploy.md).

Conteúdo: `/conteudo` lista o que está publicado. Na home, a faixa “No ar” troca de quadro e mostra a transcrição do spot. A foto de avaliação abre num diálogo e é um bloco de cor, com texto alternativo.

Indicação: entre com a Ana e abra `/conta/indicar`. O código dela é `ANALUZRANA`. No cadastro, quem cola esse código ganha 80 pontos, e a Ana ganha 150, quando o primeiro pedido é pago.

| Etapa | O que você encontra | Nesta linha |
| --- | --- | --- |
| 1. Fundação | Visual escuro com lima, título em caixa alta, home com atleta, catálogo, busca, página de produto com sabor e rótulo | Fechada |
| 2. Descoberta | Quiz, calculadora, kit, drops com contagem, atletas e cupons | Fechada |
| 3. Compra | Carrinho, frete por CEP, Pix, boleto, parcela sandbox, conta, rastreio, favoritos | Fechada |
| 4. Recorrência e jogo | Assinatura, pontos, raspadinha, indicação | Fechada |
| 5. Conteúdo | Avaliações, blog, feed, vídeo, CMS | Fechada |
| 6. Operação | Admin, SEO, analytics, acessibilidade, LGPD, testes de ponta a ponta, deploy | Fechada |

O protótipo anterior já deixava a maior parte das telas navegáveis. Cada etapa acrescenta regra testada e documentação daquela faixa.

## O que você vai ver no final

- O site em [http://127.0.0.1:43123](http://127.0.0.1:43123)
- A API em [http://127.0.0.1:8787/health](http://127.0.0.1:8787/health), se você subir o backend
- Uma conta de demonstração: `ana@pulso.dev` / `pulso123`
- A tela `/admin` com a conta dono criada por `pnpm --filter @pulso/db create-owner`

O site funciona **sem Docker e sem banco**. O catálogo mora no código. Postgres e Redis são opcionais e servem para a API ler os mesmos produtos de um banco de verdade.

Pagamento, CEP e rótulo da ANVISA são simulação. Nenhum valor é cobrado. Os números de registro `NI-DEMO-…` são fictícios.

---

## 1. O que instalar

Use estas versões. Versão mais nova do Node pode funcionar; versão menor que 22 não.

| Programa | Versão usada neste projeto | Obrigatório? |
| --- | --- | --- |
| Git | 2.40 ou mais novo | Sim, para clonar |
| Node.js | **22** (testado em 22.23.4). O arquivo `.nvmrc` pede 22 | Sim |
| pnpm | **10.33.4** (exato, vem do `packageManager` do `package.json`) | Sim |
| Docker Desktop ou Docker Engine | que tenha o comando `docker compose` | Só se quiser Postgres e Redis |
| Um navegador | Chrome, Edge, Firefox ou Safari | Sim, para ver a loja |

Não instale o pnpm pelo `npm install -g pnpm` se o Corepack estiver disponível. O Corepack entrega a versão certa.

### 1.1 Windows 10 ou 11

Abra o **PowerShell**. Se um comando reclamar de política de execução, rode uma vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Instale o Git, o Node 22 e, se quiser banco, o Docker Desktop. Pelo winget:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.22 -e
winget install --id Docker.DockerDesktop -e
```

Se o pacote `OpenJS.NodeJS.22` não existir na sua máquina, baixe o instalador **Node.js 22 LTS** em [https://nodejs.org](https://nodejs.org) e marque a opção de adicionar ao PATH. Feche e abra o PowerShell depois de instalar.

Ative o pnpm 10.33.4:

```powershell
corepack enable
corepack prepare pnpm@10.33.4 --activate
node -v
pnpm -v
git --version
```

O esperado é `v22.x.x`, `10.33.4` e uma versão do Git. Se `node` não for encontrado, reinicie o computador para o PATH atualizar.

Docker: abra o aplicativo **Docker Desktop** e espere o ícone da baleia ficar estável. No PowerShell:

```powershell
docker version
docker compose version
```

### 1.2 Linux (Ubuntu, Debian e derivados)

No terminal:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
```

Instale o Node 22 com nvm (não use o `apt install nodejs` do Ubuntu: ele costuma ser antigo):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# feche o terminal e abra de novo, ou rode:
#   source ~/.bashrc
nvm install 22
nvm use 22
node -v
```

Ative o pnpm:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm -v
```

Docker (opcional). No Ubuntu 24.04 o pacote abaixo já traz o Compose v2:

```bash
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"
```

Saia e entre de novo na sessão para o grupo `docker` valer. Teste com `docker compose version`. Se preferir o repositório oficial da Docker, siga a documentação da Docker para a sua distro e pare aqui.

Fedora:

```bash
sudo dnf install -y git curl
# Node 22 via nvm, os mesmos comandos curl/nvm acima
sudo dnf install -y docker docker-compose
sudo systemctl enable --now docker
```

### 1.3 macOS

Instale o Homebrew se ainda não tiver, em [https://brew.sh](https://brew.sh). Depois:

```bash
brew install git
brew install node@22
brew link --overwrite node@22
node -v
```

Se o `brew link` avisar de conflito, use nvm em vez do Homebrew:

```bash
brew install nvm
# siga as linhas que o brew imprimir para carregar o nvm no shell
nvm install 22
nvm use 22
```

pnpm:

```bash
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm -v
```

Docker (opcional):

```bash
brew install --cask docker
```

Abra o Docker Desktop pela pasta Aplicativos e espere ele iniciar. Confira com `docker compose version`.

---

## 2. Clonar o projeto

Quando o repositório existir, copie a URL (HTTPS) e rode. Troque a URL pela sua.

**macOS, Linux e Git Bash:**

```bash
git clone https://exemplo.com/seu-usuario/pulso.git
cd pulso
```

**Windows (PowerShell):**

```powershell
git clone https://exemplo.com/seu-usuario/pulso.git
cd pulso
```

Se a pasta do projeto já está na sua máquina (por exemplo você abriu este diretório no editor), pule o `git clone` e entre nela:

```bash
cd caminho/da/pasta/pulso
```

Confira se você está na raiz. Estes arquivos precisam existir aqui: `package.json`, `pnpm-workspace.yaml`, `.env.example`, `docker-compose.yml`.

---

## 3. Instalar as dependências

Na raiz, uma vez:

```bash
pnpm install
```

Isso baixa Next.js, React, Hono, Vitest e o resto, e grava o que foi instalado no `pnpm-lock.yaml`. Não rode `npm install` nem `yarn`. Não rode `pnpm install` dentro de `apps/web`: este repositório é um monorepo e o pnpm da raiz é quem enxerga os pacotes `@pulso/*`.

Se o pnpm 10 avisar que ignorou scripts de `esbuild` ou `sharp`, o `package.json` da raiz já lista esses pacotes em `pnpm.onlyBuiltDependencies`. Rode `pnpm install` de novo na raiz. Sem o script do `esbuild`, o `pnpm test` quebra.

---

## 4. Configurar o ambiente

O projeto lê **um único** arquivo `.env` na raiz. Não crie `.env` dentro de `apps/web`.

O comando `pnpm dev` cria o `.env` sozinho se ele não existir, copiando o exemplo. Você também pode criar na mão.

**macOS e Linux:**

```bash
cp .env.example .env
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

Abra o `.env` num editor de texto. Cada linha `NOME=valor` é uma variável. Linhas com `#` são comentário. Não coloque espaço antes do `=`. Não use aspas, a não ser que o valor tenha espaço (nenhum valor padrão tem).

### O que cada variável faz

| Variável | Padrão | O que é |
| --- | --- | --- |
| `WEB_PORT` | `43123` | Porta do site. 43123 evita brigar com outro projeto na 3000. O navegador abre `http://127.0.0.1:43123`. |
| `DATA_SOURCE` | `mock` | Intenção da vitrine: `mock` usa o catálogo do código; `api` está previsto para buscar a API. **Hoje as páginas importam o catálogo direto.** Trocar para `api` ainda não muda a loja. O ponto de troca está em `apps/web/src/server/catalog.ts`, função `loadStorefront`. |
| `API_URL` | `http://127.0.0.1:8787` | Endereço da API. O `/admin` entra em `POST /v1/admin/login`. A loja visível ainda lê o catálogo do código. |
| `NEXT_PUBLIC_SITE_URL` | `http://127.0.0.1:43123` | URL pública do site, usada em SEO (sitemap, metadados). Se mudar `WEB_PORT`, mude aqui também. Variáveis `NEXT_PUBLIC_` entram no JavaScript do navegador. |
| `NEXT_PUBLIC_PIX_DISCOUNT` | `10` | Porcentagem inteira do desconto de Pix **mostrada** na interface. A conta do carrinho usa a regra do pacote `@pulso/domain` (também 10%). |
| `NEXT_PUBLIC_FREE_SHIPPING_CENTS` | `29900` | Piso do frete PAC grátis em **centavos**. `29900` é R$ 299,00. Níveis Bruto e Lenda podem baixar esse piso na regra de domínio. |
| `API_PORT` | `8787` | Porta da API Hono. |
| `API_DATA_SOURCE` | `mock` | `mock`: a API responde com o catálogo em memória. `postgres`: a API monta o produto pelas tabelas normalizadas (`product_flavors`, `product_variants`, rótulo, fotos). A coluna `products.payload` deixa de ser a leitura. Aí você precisa do Docker, da migração e do seed. |
| `DATABASE_URL` | `postgres://pulso:pulso@127.0.0.1:5432/pulso` | Conexão do Postgres local. Usuário `pulso`, senha `pulso`, banco `pulso`, porta `5432`. Só vale para esta máquina. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Cache opcional da API (chave `catalog:products`, 60 segundos). Se apagar a linha, a API não tenta Redis. |
| `ADMIN_SESSION_SECRET` | `pulso-dev-session-change-me` | Segredo que a API usa para assinar o cookie `pulso_admin` (12 horas, httpOnly, SameSite=Lax). O site não lê esse valor: ele só repassa o cookie. Troque antes de publicar. Sem o segredo, ou com este exemplo em produção, o login responde 503. |
| `PAYMENT_GATEWAY` | `auto` | Sandbox. `auto` manda Pix e boleto ao Mercado Pago e cartão à Pagar.me. `mercadopago` ou `pagarme` força o gateway. Não coloque token real. A confirmação mostra um id `mp_sandbox_` ou `pm_sandbox_`. |

O arquivo `.env` está no `.gitignore`. Não faça commit dele.

---

## 5. Subir os serviços

### 5.1 Sem Docker (caminho mais curto)

Não suba nada. Deixe `DATA_SOURCE=mock` e `API_DATA_SOURCE=mock`. Pule para a seção 7 e rode só o site. A API também sobe nesse modo e não fala com banco.

### 5.2 Com Docker (Postgres 16 e Redis 7)

O Docker Desktop (Windows e macOS) ou o serviço Docker (Linux) precisa estar ligado.

Na raiz:

```bash
pnpm db:up
```

Isso é `docker compose up -d`. Sobe:

- `postgres:16-alpine` na porta **5432**, usuário/senha/banco `pulso`
- `redis:7-alpine` na porta **6379**

Os dados ficam nos volumes `pulso_pg` e `pulso_redis`. O SQL inicial **não** entra sozinho: a migração é um passo separado.

Confira:

```bash
docker compose ps
```

Os dois serviços devem estar `healthy` ou `running`.

Se a porta 5432 ou 6379 já estiver ocupada, edite `docker-compose.yml` e o `.env` juntos. Exemplo, Postgres na 5433 do seu computador e 5432 dentro do container:

```yaml
ports:
  - "5433:5432"
```

E no `.env`:

```
DATABASE_URL=postgres://pulso:pulso@127.0.0.1:5433/pulso
```

O mesmo vale para o Redis (`6379:6379` vira `6380:6379` e `REDIS_URL=redis://127.0.0.1:6380`).

---

## 6. Migração e seed

Só faça isto se o Postgres estiver no ar. No modo mock, pule a seção.

A migração aplica, em ordem, todos os arquivos `packages/db/sql/*.sql`. Eles são idempotentes (`create table if not exists`): rodar de novo não apaga dados.

O seed grava produtos, cupons, atletas, posts e avaliações a partir do catálogo TypeScript, nas colunas normalizadas. A API, com `API_DATA_SOURCE=postgres`, lê essas colunas. Foto de mock fica com `url` nula e `fallback_hex` com a cor.

A conta dono não entra no seed. Com o Postgres no ar, grave a senha num arquivo fora do repositório (modo 600) e rode o script que já existe:

```bash
pnpm --filter @pulso/db create-owner
```

Ele lê `ADMIN_OWNER_EMAIL`, `ADMIN_OWNER_NAME` e `ADMIN_OWNER_PASSWORD_FILE`. Não imprime a senha e não aceita senha na linha de comando.

```bash
pnpm db:migrate
pnpm db:seed
```

Se o Postgres ainda estiver acordando:

```bash
node scripts/wait-for-postgres.mjs
pnpm db:migrate
pnpm db:seed
```

Para zerar volumes, esperar o banco e semear de uma vez:

```bash
pnpm db:reset
```

Isso apaga o volume do Postgres. Pedidos que você tiver gravado no banco somem. O carrinho do navegador **não** está nesse banco: ele fica no `localStorage` (veja a seção 10).

Para a API ler o banco, no `.env`:

```
API_DATA_SOURCE=postgres
```

Reinicie a API depois de mudar o `.env`.

---

## 7. Rodar o site e a API

São dois processos. Abra dois terminais na raiz do projeto.

### Terminal 1 — site

```bash
pnpm dev
```

O script cria o `.env` se faltar e sobe o Next.js em `0.0.0.0` na `WEB_PORT` (padrão 43123). Abra:

[http://127.0.0.1:43123](http://127.0.0.1:43123)

Deixe esse terminal aberto. Quando você salvar um arquivo, a página atualiza. Para parar, `Ctrl+C`.

Atalhos iguais: `pnpm dev:web`.

### Terminal 2 — API (opcional para navegar na loja)

```bash
pnpm dev:api
```

Espere a linha `API PULSO em http://127.0.0.1:8787`. Teste no navegador ou com curl:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/v1/products
```

O `/health` com `API_DATA_SOURCE=mock` e sem Redis responde `postgres: "skipped"` e `redis: "skipped"`. Isso é o esperado.

### Os dois juntos

```bash
pnpm dev:all
```

O Turborepo sobe site e API no mesmo terminal. `Ctrl+C` para os dois.

### Passeio de 2 minutos

1. Home: atleta, potes, Pix, drop com contagem.
2. Loja → um produto → troque o sabor e o tamanho.
3. Adicione ao carrinho. A barra de frete grátis sobe.
4. Checkout. CEP de teste: `01310-100` (Avenida Paulista). CPF de teste: `529.982.247-25`. Cartão de teste: `4242 4242 4242 4242`, validade futura, qualquer CVV.
5. Marque 18+, termos e LGPD. A confirmação mostra Pix ou boleto com o aviso de simulação.
6. Entrar com `ana@pulso.dev` / `pulso123`. Ela já tem pedido, pontos e nível.
7. `/raspadinha` uma vez por dia (fuso de São Paulo). `/quiz` e `/calculadora`. `/admin` com a conta criada por `pnpm --filter @pulso/db create-owner` (a API e o Postgres precisam estar no ar).

Cupons que funcionam: `LUNA15`, `CAIO10`, `NANDA10`, `THEO10`, `PULSO10`, `RASPA5`, `RASPA10`, `RASPAFRETE`. `VENCIDO` existe e está inativo.

---

## 8. Testes, lint e build

Na raiz, com o site parado ou rodando (os testes não usam a porta 43123):

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

| Comando | O que faz |
| --- | --- |
| `pnpm lint` | ESLint no site e `tsc --noEmit` nos outros pacotes |
| `pnpm typecheck` | TypeScript em todos os pacotes, sem gerar arquivo |
| `pnpm test` | Vitest: 14 testes de domínio, 2 de catálogo, 1 de schema SQL, 3 da API |
| `pnpm build` | Build de produção do Next e checagem de tipos dos pacotes |
| `pnpm --filter @pulso/domain test` | Só as regras de preço, Pix, frete, CPF e cupom |
| `pnpm test:e2e` | Playwright abre a home e a página do Caos. Antes, uma vez: `pnpm --filter @pulso/web exec playwright install chromium` |

O CI (`.github/workflows/ci.yml`) usa pnpm 10.33.4, Node 22, `pnpm install --frozen-lockfile`, lint, typecheck, test e build com `DATA_SOURCE=mock`.

Build de produção local, depois de `pnpm build`:

```bash
pnpm start
```

A API compilada não gera pasta `dist`: `pnpm start:api` executa o TypeScript com `tsx`.

---

## 9. Erros comuns e o que fazer

**`pnpm` não é reconhecido.**  
O Node não está no PATH ou o Corepack não foi ativado. Feche o terminal, abra de novo e rode `corepack enable` e `corepack prepare pnpm@10.33.4 --activate`. No Windows, reinicie depois de instalar o Node.

**`The engine "node" is incompatible` ou erro de sintaxe estranho.**  
Você está no Node 18 ou 20. Rode `node -v`. Precisa ser 22 ou mais. Com nvm: `nvm use 22`.

**`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` ao adicionar pacote.**  
O comando rodou dentro de `apps/web`. Volte para a raiz e use `pnpm --filter @pulso/web add nome-do-pacote`.

**Porta 43123 ocupada (`EADDRINUSE`).**  
Outro `pnpm dev` ainda está aberto, ou outro programa usa a porta. Feche o terminal antigo ou mude `WEB_PORT` e `NEXT_PUBLIC_SITE_URL` no `.env` e rode de novo.

**Porta 5432 ocupada / `password authentication failed` / `connection refused`.**  
Outro Postgres local está na 5432, ou o container não subiu. `docker compose ps`. Se a porta for o problema, siga o exemplo da seção 5.2. Se você não precisa de banco, volte `API_DATA_SOURCE` para `mock`.

**`Postgres não respondeu` no `db:reset`.**  
O Docker não está aberto, ou o nome do serviço não é `postgres`. Abra o Docker e rode `docker compose ps` na raiz.

**`permission denied` no Docker (Linux).**  
Seu usuário não está no grupo `docker`. Rode `sudo usermod -aG docker "$USER"`, saia e entre de novo. Não use `sudo pnpm` no dia a dia.

**Botão não responde, quiz parado em "1 / 5" ou login vai para `/entrar?`.**  
O JavaScript de desenvolvimento não carregou. O Next 16 bloqueia chunk quando o site abre em `127.0.0.1` e o processo escuta em `0.0.0.0`. A config `allowedDevOrigins` em `apps/web/next.config.ts` libera esse host. Pare o `pnpm dev` e suba de novo. No console, um 403 em `/_next/static` é esse caso.

**Página em branco ou estilo sem Tailwind depois de mudar CSS.**  
Pare o servidor, apague o cache e suba de novo:

```bash
rm -rf apps/web/.next
pnpm dev
```

No Windows PowerShell: `Remove-Item -Recurse -Force apps/web/.next`.

**A loja não mudou quando coloquei `DATA_SOURCE=api`.**  
Esperado neste protótipo. As páginas leem `@pulso/data`. A função pronta para a troca é `loadStorefront` em `apps/web/src/server/catalog.ts`. A API, sim, obedece `API_DATA_SOURCE`.

**`/admin` não entra.**  
A tela usa a conta da API, não uma senha do site. Suba a API com Postgres, defina `ADMIN_SESSION_SECRET` e crie o dono com `pnpm --filter @pulso/db create-owner`. Trinta falhas no mesmo IP respondem 429. Senha errada só atrasa a resposta, até 8 segundos.

**Carrinho ou login “fantasma”.**  
O estado fica no `localStorage`, chave `pulso-store`. Limpe o armazenamento do site no navegador (seção 10).

**`Ignored build scripts: esbuild` e o teste falha em seguida.**  
Rode `pnpm install` na raiz. O `package.json` precisa ter `pnpm.onlyBuiltDependencies` com `esbuild`, `unrs-resolver` e `sharp`.

**Windows: `next` não inicia pelo script.**  
O `scripts/next.mjs` usa `shell` só no Windows. Rode a partir da raiz com `pnpm dev`, não clicando duas vezes no arquivo.

---

## 10. Parar e resetar

### Parar o site e a API

No terminal onde eles estão rodando, `Ctrl+C`. Se usou `pnpm dev:all`, um `Ctrl+C` encerra os dois.

### Parar Postgres e Redis, mantendo os dados

```bash
pnpm db:down
```

Isso é `docker compose down`. Os volumes continuam. `pnpm db:up` devolve o banco como estava.

### Apagar o banco e semear de novo

```bash
pnpm db:reset
```

### Apagar só o carrinho, a conta e o admin do navegador

O protótipo grava sessão em `localStorage`, não no Postgres.

1. Abra a loja.
2. DevTools (F12) → Application / Armazenamento → Local Storage → o endereço da loja.
3. Apague a chave `pulso-store`.
4. Recarregue a página.

A conta `ana@pulso.dev` volta, porque ela é semeada de novo no código quando o armazenamento é lido.

### Reinstalar dependências do zero

Pare os servidores. Na raiz:

**macOS e Linux:**

```bash
rm -rf node_modules apps/web/node_modules apps/web/.next
pnpm install
```

**Windows (PowerShell):**

```powershell
Remove-Item -Recurse -Force node_modules, apps/web/.next -ErrorAction SilentlyContinue
pnpm install
```

Não apague `pnpm-lock.yaml` se você só quer uma instalação limpa.

---

## Mapa curto do repositório

```
apps/web     site Next.js
apps/api     API Hono
packages/domain   regras de preço, frete, Pix, pontos, CPF
packages/data     catálogo fictício
packages/db       SQL, migração e seed
docs/        documentação do produto e do código
```

O passo a passo de cada funcionalidade está em [docs/funcionalidades.md](docs/funcionalidades.md).
