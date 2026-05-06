# Frontend

Frontend React + TypeScript + Vite do assistente Patrimonio360.

Para o setup end-to-end em desenvolvimento local, ve o guia principal em [../README.md](../README.md).

## Dependencias

```bash
cd frontend
npm install
```

## Configuracao local

Criar ou editar `frontend/.env.local`:

```env
VITE_TOURS_BASE_URL=http://localhost:5500
VITE_CHAT_BACKEND_BASE_URL=http://localhost:8000
VITE_ENABLE_DEMO=true
```

## Arranque em dev

```bash
cd frontend
npm run dev
```

O frontend fica por omissao em `http://localhost:5173`.

## Scripts

- `npm run dev`: servidor Vite em desenvolvimento
- `npm run build`: build de producao
- `npm run build:embed`: build para Firebase/iframe com a demo desligada; copia `../tours/*` para `dist/tours` quando `VITE_TOURS_BASE_URL=/tours`
- `npm run copy:tours`: copia manualmente as tours estaticas para `dist/tours`
- `npm run preview`: preview local da build
- `npm run lint`: lint do frontend

## Dependencias externas em runtime

Para funcionar localmente, o frontend espera:

- backend em `http://localhost:8000`
- tours estaticas em `http://localhost:5500`

Sem isto, a shell do frontend abre, mas o chat e a embebicao das tours nao funcionam corretamente.

## Rotas

- `/`: abre a pagina completa do frontend (lista/mapa/tour)
- `/embed/:slug/`: abre a experiencia de embed para integracao externa

## Firebase Hosting

Para servir so o embed no Firebase, faz build com a demo desligada:

```powershell
cd frontend
$env:VITE_ENABLE_DEMO='false'
$env:VITE_TOURS_BASE_URL='/tours'
$env:VITE_CHAT_BACKEND_BASE_URL='https://o-teu-backend'
npm run build:embed
cd ..
firebase deploy --only hosting
```

Depois usa o iframe com o caminho do embed:

```html
<iframe src="https://patrimonio360-amalia-frontend.web.app/embed/mnaz/" allow="fullscreen; xr-spatial-tracking" allowfullscreen></iframe>
```

Se as tours ficarem noutro host, define `VITE_TOURS_BASE_URL` para esse URL absoluto e o `build:embed` nao copia `../tours` para o Firebase.

Nas GitHub Actions deste repo, `COPY_TOURS=false` esta ativo porque `../tours` esta no `.gitignore`. Define as repository variables `VITE_TOURS_BASE_URL` e `VITE_CHAT_BACKEND_BASE_URL` antes de usares o deploy automatico.
