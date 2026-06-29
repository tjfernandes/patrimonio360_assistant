# Patrimonio360 Assistant

Guia de desenvolvimento local para o sistema completo:

- `frontend/`: aplicação React/Vite
- `backend/`: API FastAPI, chat, retrieval e query planning
- `backend/multiview_worker/`: worker Node/Puppeteer usado na pesquisa por modelos 3D
- `tours/`: visitas virtuais estáticas já geradas

Este README cobre apenas desenvolvimento local.

## Arquitetura local

Em dev, o sistema corre tipicamente em 3 servidores:

- `frontend` em `http://localhost:5173`
- `backend` em `http://localhost:8000`
- `tours` estáticas em `http://localhost:5500`

O `multiview_worker` nao precisa de ser arrancado manualmente em separado no fluxo normal. O backend arranca-o automaticamente no primeiro pedido de pesquisa 3D, desde que as dependencias de `backend/multiview_worker` estejam instaladas.

## Pre-requisitos

- Python 3.11+ com `pip`
- Node.js 18+ com `npm`
- Docker, se  correr o OpenSearch localmente
- OpenSearch com os indices ja carregados

Notas:

- O `backend` depende de `torch`, `transformers` e embeddings multimodais. A instalacao pode demorar.
- O `multiview_worker` usa `puppeteer`; o `npm install` pode descarregar Chromium.
- As `tours` atuais sao ficheiros estaticos ja gerados. Nao ha pipeline de build dedicada neste repositório para as gerar novamente.

## 1. OpenSearch

O backend precisa de um OpenSearch acessivel e com dados. Sem isso, o chat sem retrieval pode responder, mas a pesquisa no acervo, image search e model search falham.

Se ja tens o contentor local criado:

```bash
docker start opensearch
```

Valida que responde na porta esperada:

```bash
curl -k https://localhost:9200
```

Se precisares de restaurar um volume ou usar o backup local, ve tambem [backend/README.md](./backend/README.md).

## 2. Backend

### Dependencias Python

```bash
cd backend
python -m venv .venv
```

Ativacao:

PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

bash:

```bash
source .venv/bin/activate
```

Instalacao:

```bash
pip install --index-url https://download.pytorch.org/whl/cu128 torch==2.8.0+cu128 torchvision==0.23.0+cu128
pip install -r requirements.txt
```

Instala primeiro `torch`/`torchvision` separadamente e so depois `requirements.txt`. O guia direto esta em [INSTALL.md](./INSTALL.md).

### Configuracao do backend

O backend le `backend/.env`.

Existe um exemplo em `backend/.env.example`, mas em dev o normal aqui e editares `backend/.env` diretamente.

Campos minimos a confirmar:

```env
APP_ENV=development
OPENSEARCH_HOST=localhost
OPENSEARCH_PORT=9200
OPENSEARCH_SCHEME=https
OPENSEARCH_VERIFY_CERTS=false

LLM_PROVIDER=openai_compatible
LLM_BASE_URL=https://api.novasearch.org/amalia-llm/v1/chat/completions
LLM_API_KEY=
LLM_MODEL=carminho/AMALIA-9B-50-DPO

IMAGE_ASSET_ROOT=../assets/images
MULTIVIEW_WORKER_HOST=127.0.0.1
MULTIVIEW_WORKER_PORT=3101
MULTIVIEW_RENDER_STRATEGY=adaptive
```

Campos uteis em dev:

- `CHAT_ENABLE_RAG=true`
- `CHAT_ENABLE_LLM_LEXICAL_QUERY=true`
- `CHAT_USE_QUERY_EMBEDDINGS=true`
- `CHAT_RETRIEVAL_EMBEDDING_ONLY=false`
- `LOG_JSON=true`
- `LOG_JSON_PRETTY=true`
- `POI_TOURS_DIR=` pode ficar vazio se estiveres a usar o diretório default `backend/poi_tours`

### Arranque do backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health checks:

- `http://localhost:8000/health`
- `http://localhost:8000/api/v1/chat/health`

## 3. Multiview Worker

### Dependencias

Instalar uma vez:

```bash
cd backend/multiview_worker
npm install
```

Isto instala:

- `express`
- `puppeteer`
- Chromium usado pelo worker

### Como funciona em dev

- Nao precisas de correr `npm start` manualmente no uso normal
- O backend faz spawn de `node server.js` quando recebe o primeiro pedido de model retrieval
- Se o Node.js nao existir, ou se faltarem dependencias neste diretório, a pesquisa 3D falha

Se quiseres testar o worker isoladamente:

```bash
cd backend/multiview_worker
npm start
```

Health check manual:

- `http://127.0.0.1:3101/health`

## 4. Frontend

### Dependencias

```bash
cd frontend
npm install
```

### Configuracao

O frontend usa:

- `frontend/.env.local` para dev local
- `frontend/.env.example` como base minima

Valores recomendados em dev:

```env
VITE_TOURS_BASE_URL=http://localhost:5500
VITE_CHAT_BACKEND_BASE_URL=http://localhost:8000
```

### Arranque

```bash
cd frontend
npm run dev
```

O Vite arranca por omissao em `http://localhost:5173`.

Notas:

- Em WSL sobre ficheiros montados em `/mnt/...`, o `vite.config.ts` ja ativa polling automaticamente para melhorar hot reload.
- O frontend fala com o backend via `VITE_CHAT_BACKEND_BASE_URL`.
- As tours sao resolvidas via `VITE_TOURS_BASE_URL`.

## 5. Tours

As tours em `tours/` sao conteudo estatico ja gerado. Para desenvolvimento local, basta servi-las como ficheiros estaticos.

Na raiz do repositório:

```bash
python -m http.server 5500 --directory tours
```

Exemplos:

- `http://localhost:5500/mnaz/`
- `http://localhost:5500/mnt/`
- `http://localhost:5500/mj/`

Nao existe neste repositório um processo de build/documentacao consolidado para regenerar estas tours. O que esta versionado aqui e o output estatico.

## Ordem recomendada de arranque

Abre 4 terminais:

1. OpenSearch

```bash
docker start opensearch
```

2. Backend

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. Tours

```bash
python -m http.server 5500 --directory tours
```

4. Frontend

```bash
cd frontend
npm run dev
```

Depois abre:

- `http://localhost:5173`

## Validacao rapida

### Chat textual

- abre o frontend
- entra num museu
- envia uma pergunta textual simples

### Pesquisa por imagem

- confirma que `IMAGE_ASSET_ROOT` aponta para `assets/images`
- envia uma imagem no chat
- valida que a resposta mostra imagens de artefactos

### Pesquisa por modelo 3D

- garante que `backend/multiview_worker/node_modules` existe
- envia um `.glb`, `.gltf` ou `.obj`
- no primeiro pedido o backend pode demorar mais porque arranca o worker
- valida que aparecem logs do worker no terminal do backend

### Tours

- valida que `http://localhost:5500/mnaz/` abre diretamente
- valida que o frontend consegue embutir a tour correta

## Problemas comuns

### `OPENSEARCH_HOST is required for retrieval`

O `backend/.env` nao esta configurado corretamente, ou o processo nao foi arrancado a partir de `backend/`.

### `Backend de chat nao configurado (VITE_CHAT_BACKEND_BASE_URL)`

Falta `frontend/.env.local` ou o valor esta vazio.

### O upload 3D falha logo no backend

Confirma:

- Node.js instalado
- `backend/multiview_worker/npm install` executado
- porta `3101` livre

### O upload 3D arranca mas o worker falha em runtime

Verifica os logs no terminal do backend. O output do worker e reenviado pelo backend com prefixo `[multiview-worker]`.

### O frontend nao mostra imagens de resultados

Confirma `IMAGE_ASSET_ROOT` no `backend/.env`. Em dev local, o valor atual esperado e:

```env
IMAGE_ASSET_ROOT=../assets/images
```

### O frontend nao encontra as tours

Confirma:

- servidor estatico das tours em `http://localhost:5500`
- `frontend/.env.local` com `VITE_TOURS_BASE_URL=http://localhost:5500`

## Referencias adicionais

- Backend API e detalhes de retrieval: [backend/README.md](./backend/README.md)
- Frontend: [frontend/README.md](./frontend/README.md)
