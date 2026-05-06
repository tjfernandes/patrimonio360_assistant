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
