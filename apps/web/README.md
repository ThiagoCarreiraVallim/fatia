# @fittrack/web

PWA Next.js 15 — frontend para visualização e logging manual.

## Setup (a ser executado em F0.5)

```bash
cd apps
pnpm create next-app@latest web --typescript --tailwind --app --src-dir --import-alias "@/*"
cd web

# shadcn/ui
pnpm dlx shadcn@latest init

# Componentes que vamos usar (instalar conforme precisar)
pnpm dlx shadcn@latest add button card dialog input label select tabs toast

# Outras deps
pnpm add @tanstack/react-query
pnpm add react-hook-form @hookform/resolvers zod
pnpm add recharts
pnpm add lucide-react
pnpm add date-fns
pnpm add next-pwa
```

## Estrutura prevista

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # Bottom nav
│   │   ├── page.tsx                # Hoje (Nutrição)
│   │   ├── nutrition/goals/page.tsx
│   │   ├── workout/
│   │   │   ├── page.tsx            # Treino de hoje
│   │   │   ├── plans/page.tsx
│   │   │   └── history/page.tsx
│   │   ├── progress/page.tsx
│   │   └── profile/page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn
│   ├── nutrition/
│   ├── workout/
│   ├── progress/
│   └── layout/
├── lib/
│   ├── api.ts                      # Fetch helpers
│   ├── auth.ts                     # Server-side auth helpers
│   └── utils.ts
└── styles/
```

## Tema

Dark-only. Tokens em `globals.css` conforme `docs/DESIGN.md`.
