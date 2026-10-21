# Weekday Commissioner Demo

Interactive Vite/React prototype for the commissioner, registration, assignment-email, and enrollment flows.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Resend-backed email flow requires the environment values documented in `.env.example`. Local registration records are written to `data/registrations.json`, which is intentionally ignored by Git.

## Build

```bash
npm run build
```
