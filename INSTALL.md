# Instalacao local

Guia direto para instalar e correr o projeto completo: backend, multiview worker, tours estaticas e frontend.

## Pre-requisitos

- Python 3.11+
- Node.js 20+ com npm
- Para GPU: driver NVIDIA compativel com o wheel PyTorch escolhido

## 1. Backend

PowerShell, a partir da raiz do repo:

```powershell
cd backend
py -3.11 -m venv visitas_virtuais
.\visitas_virtuais\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
```

Instala PyTorch separadamente. Escolhe uma opcao (verificar compatibilidade com GPU).

1. GPU NVIDIA moderna, CUDA 12.8 (melhor):

```powershell
python -m pip install --index-url https://download.pytorch.org/whl/cu128 torch==2.8.0+cu128 torchvision==0.23.0+cu128
```

2. GPU NVIDIA mais antiga, tentar CUDA 12.6:

```powershell
python -m pip install --index-url https://download.pytorch.org/whl/cu126 torch torchvision
```

3. CPU only:

```powershell
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
```

Validar PyTorch:

```powershell
python -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())"
```

Depois instalar o resto do backend:

```powershell
python -m pip install -r requirements.txt
```

Corrar o backend:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health checks:

```powershell
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/chat/health
```

## 2. Multiview worker

Abre outro terminal:

```powershell
cd backend\multiview_worker
npm install
npm start
```

Health check:

```powershell
curl http://127.0.0.1:3101/health
```

Nota: no uso normal, o backend tambem consegue arrancar o worker sozinho no primeiro pedido de modelo 3D. Correr `npm start` manualmente e util para testar.

Em Linux/Ubuntu, se o Chromium do Puppeteer falhar por bibliotecas em falta:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 libxss1 libxtst6
```


## 3. Frontend

Abrir outro terminal:

```powershell
cd frontend
npm install
```

Correr o frontend:

```powershell
npm run dev
```

Abrir:

```text
http://localhost:5173
```

## Ordem para correr tudo

Terminal 1:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2:

```powershell
cd frontend
npm run dev -- --host 0.0.0.0
```
