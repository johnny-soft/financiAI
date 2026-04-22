# FinAI

**FinAI** é uma plataforma moderna e inteligente de Gestão Financeira Pessoal (Personal Finance Management). Construído para ir além dos simples "cadernos de gastos", o FinAI usa o poder do Open Finance em conjunto com os Modelos de Linguagem (Google Gemini) para sincronizar, classificar e analisar a saúde financeira dos usuários no piloto automático.

---

## 🚀 Principais Recursos

- **Open Finance Integrado (Pluggy):** Sincronização automática e contínua de contas correntes, cartões de crédito e carteiras de investimento e poupança via Pluggy.
- **Auto-Categorização Inteligente:** Utiliza o Google Gemini e um sistema de **IA Autodidata** (Memory Loop) que auto-classifica suas transações. E o melhor: a IA *aprende* com cada correção manual que você faz no app, para não cometer os mesmos erros na próxima varredura.
- **Comitê Financeiro Virtual (AI Insights):** O motor de IA simula um painel analítico voltado ao Mercado Financeiro e à economia pessoal. Ele cruza seu caixa atual para sugerir cortes de despesas e apontar os melhores alvos de investimentos (B3, FIIs, CDB, etc).
- **Controle Flexível de Modelos AI:** Selecione dinamicamente com qual IA do Google você quer trabalhar (`Gemini 1.5 Flash`, `Gemini 2.5 Pro`, entre outros), lendo em tempo real os motores hospedados para sua API Key.
- **Relatórios Avançados:** Dashboard elástico com Gráficos ricos interativos (`Recharts`). Visualize seus dados com zoom desde *Hoje (1d)* até os últimos *6 Meses (6m)* e obtenha navegação clicável para explorar grupos individuais.
- **Total Personalização:** Gestão e alteração de todas as categorias base, contas individuais, cartões e lançamentos em tempo real via UI robusta em Mobile e Desktop.

---

## 🛠️ Stack Tecnológica

O ecossistema é suportado por tecnologias e arquiteturas de altíssima escala:

*   **Frontend:** [Next.js (App Router)](https://nextjs.org/) + React
*   **Apresentação:** Responsividade extrema construída com flexbox + UI Elements.
*   **Database & Auth:** [Supabase](https://supabase.com/) (Autenticação JWT, Storage, e PostgreSQL robusto com RPCs nativos).
*   **Integração Bancária:** API [Pluggy](https://pluggy.ai/) para agregação Open Finance de centenas de bancos brasileiros.
*   **Motor de Inteligência:** [Google Gemini API](https://ai.google.dev/) com modelagem reversa, context packing e System Prompts em `JSON-strict mode`.
*   **Visualização Analítica:** [Recharts](https://recharts.org/)

---

## ⚙️ Variáveis de Ambiente Necessárias

Crie e popule um arquivo `.env.local` na raiz do seu projeto antes de decolar na Vercel ou localmente:

```env
# Banco de dados e Autenticação (Supabase)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Conexões Bancárias (Pluggy)
NEXT_PUBLIC_PLUGGY_CLIENT_ID=your_pluggy_client_id
PLUGGY_CLIENT_SECRET=your_pluggy_client_secret

# Cérebro Artificial (AI)
GEMINI_API_KEY=your_google_studio_key
```

---

## 💻 Rodando Localmente

1. Clone o pacote do repositório:
   ```bash
   git clone https://github.com/johnny-soft/financiAI.git
   ```

2. Instale todas as dependências com NPM, Yarn ou Pnpm:
   ```bash
   npm install
   ```

3. Excecute o serviço de rotas em Developer Mode:
   ```bash
   npm run dev
   ```

4. Escale e explore rodando na porta http://localhost:3000

---

## 🗄️ Estrutura de Migrações (Database SQL)
O projeto acompanha todo o Schema da aplicação localizado na pasta `/migrations`. Lembre-se de rodar esses Scripts SQL no painel de seu Supabase antes do deploy de produção para levantar as tabelas rígidas que englobam todo o motor e comportamento do app!

> Construído com dedicação e engenharia moderna! Mantenha suas finanças escalando no tempo.
