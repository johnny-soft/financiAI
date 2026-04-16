# CLAUDE.md — FinTrack (finAI)

> Project-level instructions for AI assistants working on this codebase.

## Project Overview

**FinTrack** is a personal finance management web application targeting Brazilian users. It provides dashboard analytics, transaction tracking, budget management, financial goals, AI-powered insights, and automatic bank synchronization via the Pluggy open banking API.

**All UI text is in Brazilian Portuguese (pt-BR).** Currency is BRL. Date format is `dd/MM/yyyy`.

---

## Tech Stack

| Layer          | Technology                                                  |
| -------------- | ----------------------------------------------------------- |
| Framework      | **Next.js 14.2.3** (App Router)                             |
| Language       | **TypeScript 5**                                            |
| UI Library     | **React 18**                                                |
| Styling        | **Tailwind CSS 3.4** with CSS custom properties for theming |
| UI Primitives  | **Radix UI** (Dialog, Select, Tabs, Tooltip, Popover, Dropdown Menu, Progress) |
| Icons          | **Lucide React**                                            |
| Charts         | **Recharts**                                                |
| Auth & DB      | **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`)    |
| Bank Sync      | **Pluggy API** (Brazilian open banking)                     |
| Toasts         | **react-hot-toast**                                         |
| Utilities      | `clsx`, `tailwind-merge`, `date-fns`                        |

---

## Project Structure

```
finAI/
├── migrations/              # SQL schema migrations (Supabase)
│   └── 001_schema.sql       # Complete database schema
├── src/
│   ├── app/                  # Next.js App Router pages
│   │   ├── api/              # API route handlers
│   │   │   ├── accounts/     #   GET/POST accounts
│   │   │   ├── ai-insights/  #   GET insights + generate/ + [id]/
│   │   │   ├── categories/   #   GET/POST categories
│   │   │   ├── dashboard/    #   GET dashboard summary
│   │   │   ├── goals/        #   GET/POST goals + [id]/
│   │   │   ├── reports/      #   GET reports data
│   │   │   └── transactions/ #   GET/POST transactions + [id]/
│   │   ├── ai-insights/      # AI insights page
│   │   ├── dashboard/        # Main dashboard (layout.tsx + page.tsx)
│   │   ├── goals/            # Financial goals page
│   │   ├── reports/          # Reports & analytics page
│   │   └── transactions/     # Transactions list page
│   ├── components/           # Reusable React components
│   │   ├── AppLayout.tsx     # App shell with sidebar navigation
│   │   └── transaction/
│   │       └── TransactionModal.tsx
│   ├── lib/                  # Shared utilities and integrations
│   │   ├── pluggy.ts         # Pluggy API client (auth, fetch, mapping)
│   │   ├── utils.ts          # Formatting, date helpers, label maps
│   │   └── supabase/
│   │       ├── client.ts     # Browser-side Supabase client
│   │       └── server.ts     # Server-side Supabase client (cookies)
│   └── types/
│       └── index.ts          # All TypeScript type definitions
├── tailwind.config.ts        # Custom theme (colors via CSS vars, animations)
├── postcss.config.js
├── next.config.mjs
└── package.json
```

---

## Architecture & Patterns

### Supabase Client Split

- **Browser (Client Components):** `import { createClient } from '@/lib/supabase/client'`
- **Server (API Routes / Server Components):** `import { createClient } from '@/lib/supabase/server'`

Always use the correct client for the context. The server client reads cookies via `next/headers`.

### API Routes

- Located under `src/app/api/`.
- Return `ApiResponse<T>` shape: `{ data?: T, error?: string }`.
- Authenticate via Supabase `auth.getUser()` in each route handler.
- All tables have Row Level Security (RLS) — queries are automatically scoped to the authenticated user.

### Component Conventions

- **`'use client'`** directive is used for interactive components.
- Class names use the `cn()` utility from `@/lib/utils` (combines `clsx` + `twMerge`).
- Icons come from `lucide-react` — use consistent sizes (13–20px depending on context).
- Navigation labels and all user-facing text must be in **Brazilian Portuguese**.

### Theming

- Light/dark mode via `data-theme` attribute on `<html>`.
- All colors are defined as **CSS custom properties** (e.g., `--bg-base`, `--accent`, `--text-primary`).
- Tailwind config maps these variables to utility classes (e.g., `bg-bg-base`, `text-text-primary`).
- Theme toggle persists to `localStorage` under the key `theme`.

### Formatting Helpers (`src/lib/utils.ts`)

| Function              | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `cn()`                | Merge Tailwind classes safely              |
| `formatCurrency()`    | Format as BRL (R$) with pt-BR locale       |
| `formatDate()`        | Format dates as `dd/MM/yyyy`               |
| `formatRelativeDate()`| "Hoje", "Ontem", "X dias atrás"            |
| `getMonthName()`      | Portuguese month names                     |
| `getCurrentMonthRange()` | Start/end ISO strings for current month |
| `percentageOf()`      | Safe percentage calculation                |
| `truncate()`          | Truncate strings with ellipsis             |

### Label Constants

- `ACCOUNT_TYPE_LABELS` — Account type display names in pt-BR
- `PAYMENT_METHOD_LABELS` — Payment method display names in pt-BR
- `GOAL_CATEGORY_LABELS` — Goal category display names in pt-BR

---

## Database Schema

All tables live in Supabase (PostgreSQL). Primary keys are UUIDs (`uuid_generate_v4()`). Every table has RLS enabled and policies scoped to `auth.uid()`.

| Table                | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `profiles`           | User profile (extends `auth.users`)        |
| `categories`         | Income/expense categories with emoji icons |
| `accounts`           | Bank accounts (manual + Pluggy-synced)     |
| `transactions`       | Financial transactions                     |
| `goals`              | Financial goals with progress tracking     |
| `goal_contributions` | Individual contributions toward goals      |
| `budgets`            | Monthly budgets per category               |
| `ai_insights`        | AI-generated financial recommendations     |
| `pluggy_sync_log`    | Sync audit trail for Pluggy integration    |

### Key Database Functions

- `get_spending_by_category(user_id, start, end)` — Spending totals grouped by category
- `get_monthly_balance(user_id, months)` — Monthly income/expense/balance trend

### Triggers

- **`on_auth_user_created`** — Auto-creates profile + default categories on signup
- **`update_*_updated_at`** — Auto-updates `updated_at` on row modification

---

## Pluggy Integration

The Pluggy API (`src/lib/pluggy.ts`) handles Brazilian open banking:

- **Authentication:** Client ID/Secret → JWT token (cached for 2 hours)
- **Functions:** `getPluggyItems()`, `getPluggyAccounts()`, `getPluggyTransactions()`, `createConnectToken()`
- **Mappers:** `mapPluggyAccountType()`, `mapPluggyTransaction()`, `mapPaymentMethod()` convert Pluggy data to our internal types
- **Sync trigger:** `POST /api/pluggy/sync` from the sidebar sync button

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Pluggy
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
```

---

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

---

## Coding Guidelines

1. **Language:** All user-facing strings must be in Brazilian Portuguese.
2. **Types:** Define all types in `src/types/index.ts`. Use strict typing — avoid `any`.
3. **Imports:** Use `@/` path alias (maps to `src/`).
4. **Styling:** Prefer Tailwind utilities with the custom theme tokens. Use `cn()` for conditional classes. Use CSS custom properties for colors — never hardcode color values.
5. **Components:** Place reusable components in `src/components/`. Page-specific components can live in the page file.
6. **API routes:** Always validate auth with `supabase.auth.getUser()`. Return consistent `{ data, error }` responses.
7. **Database:** Never bypass RLS. Use `user_id` in all queries. Add appropriate indexes for new tables.
8. **Error handling:** Use `try/catch` in API routes. Surface errors via `react-hot-toast` in the UI.
9. **Dates:** Always use ISO format (`YYYY-MM-DD`) for storage/API. Format for display with `formatDate()` or `formatRelativeDate()`.
10. **Currency:** Always use `formatCurrency()` for display. Store amounts as `DECIMAL(12,2)` in the database.
