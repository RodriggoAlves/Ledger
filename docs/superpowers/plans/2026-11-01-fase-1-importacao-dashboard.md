# Fase 1 — Login, Importação, Transações, Categorização e Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web com login onde o usuário importa o CSV do PicPay, revisa/categoriza transações e vê gastos por categoria no mês.

**Architecture:** Next.js App Router com Server Actions; lógica de domínio em módulos puros em `src/domain/` testados com Vitest; persistência via Drizzle no Supabase Postgres; login via Supabase Auth (`@supabase/ssr`). Toda consulta filtra por `user_id` da sessão.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, shadcn/ui, Recharts, Drizzle ORM + `postgres`, Supabase Auth (`@supabase/ssr`), Vitest, `papaparse`.

**Spec:** `docs/superpowers/specs/2026-11-01-financas-design.md` (seções 2, 3, 4, 7 itens 1–4 e 8, 9, 10)

## Global Constraints

- Valores monetários sempre em **centavos (inteiro)**; formatação de exibição `pt-BR`/`BRL`.
- Toda tabela de domínio tem `user_id uuid not null`; toda query filtra por ele.
- Acesso ao banco **somente no servidor** (nunca importar `src/db` em componente client).
- Cadastro público desativado no Supabase; não existe tela de cadastro.
- Tipos de transação: `GASTO | RECEITA | MOVIMENTACAO`; MOVIMENTACAO não entra em totais.
- `*.csv` reais nunca commitados; fixtures anonimizados em `tests/fixtures/`.
- Textos de UI em português.
- Tabelas de cartão/investimentos (Fases 2/3) **não** são criadas nesta fase.

## Review Focus

- CSV exportado com hífen `-` em vez de `−`, ou valor sem sinal → parser deve aceitar ambos (teste na Task 2).
- Mesmo CSV importado duas vezes, ou dois CSVs com períodos sobrepostos → nenhuma transação duplicada (teste na Task 6).
- Duas transações legítimas idênticas no mesmo minuto (ex.: dois Pix de R$ 10 ao mesmo destino) → hoje colapsariam no mesmo hash; incluir índice de ocorrência no hash (teste na Task 2).
- Descrição com acentos/caixa diferente ("Uber" vs "UBER *TRIP") → regra casa (teste na Task 3).
- Usuário sem categorias (primeiro login) → seed automático antes de qualquer tela usar categorias (teste na Task 4).

---

## Estrutura de arquivos

```
src/
  domain/
    money.ts                 parse/format BRL ↔ centavos
    picpay-parser.ts         CSV → ParsedRow[]
    categorization.ts        regras → categoria
    defaults.ts              categorias e regras iniciais
  db/
    schema.ts                tabelas Drizzle
    client.ts                conexão
    seed-user.ts             ensureUserDefaults(userId)
  lib/supabase/
    server.ts, middleware.ts cliente Supabase SSR
  lib/auth.ts                requireUserId()
  app/
    login/page.tsx, login/actions.ts
    (app)/layout.tsx         nav + guarda de sessão
    (app)/page.tsx           dashboard
    (app)/importar/page.tsx, actions.ts
    (app)/transacoes/page.tsx, actions.ts
    (app)/configuracoes/page.tsx, actions.ts
  middleware.ts
tests/
  fixtures/picpay-sample.csv
  domain/*.test.ts
  db/*.test.ts               (integração, opcional com DATABASE_URL de teste)
drizzle.config.ts
```

---

### Task 1: Scaffold do projeto

**Files:** Create: projeto Next.js na raiz, `vitest.config.ts`, `.env.example`, `tests/smoke.test.ts`

**Interfaces:** Produces: `npm test` (Vitest), `npm run dev`, alias `@/` → `src/`.

- [ ] **Step 1:** `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (manter `.gitignore` existente, mesclando entradas).
- [ ] **Step 2:** Instalar: `npm i drizzle-orm postgres @supabase/ssr @supabase/supabase-js papaparse recharts` e `npm i -D vitest @types/papaparse drizzle-kit vite-tsconfig-paths`. Rodar `npx shadcn@latest init` e adicionar `button input card table select dialog badge sonner`.
- [ ] **Step 3:** `vitest.config.ts` com `vite-tsconfig-paths`, `environment: 'node'`. Script `"test": "vitest run"`.
- [ ] **Step 4:** `tests/smoke.test.ts` com `expect(1+1).toBe(2)`. Run: `npm test` → PASS.
- [ ] **Step 5:** `.env.example` com `DATABASE_URL=`, `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=`.
- [ ] **Step 6:** `npm run build` → sucesso. Commit `chore: scaffold Next.js + Vitest + shadcn`.

---

### Task 2: Dinheiro e parser do CSV PicPay

**Files:** Create `src/domain/money.ts`, `src/domain/picpay-parser.ts`, `tests/fixtures/picpay-sample.csv`, `tests/domain/money.test.ts`, `tests/domain/picpay-parser.test.ts`

**Interfaces — Produces:**
```ts
// money.ts
parseBRL(text: string): number            // "−R$ 2.013,93" → -201393 ; lança Error se inválido
formatBRL(cents: number): string          // -201393 → "-R$ 2.013,93" (Intl pt-BR)

// picpay-parser.ts
type TxType = 'GASTO' | 'RECEITA' | 'MOVIMENTACAO'
type ParsedRow = { dataHora: Date; tipoOriginal: string; descricao: string;
                   valor: number; formaPagamento: string | null; tipo: TxType; hash: string }
type ParseResult = { rows: ParsedRow[]; invalid: { line: number; raw: string; reason: string }[] }
class InvalidPicPayFileError extends Error {}
parsePicPayCsv(content: string): ParseResult   // lança InvalidPicPayFileError se cabeçalho errado
```

- [ ] **Step 1:** Fixture: copiar ~10 linhas do formato real com nomes/valores fictícios, incluindo: cabeçalho com BOM, `Pix enviado`, `Pix recebido`, `Dinheiro guardado`, `Dinheiro resgatado`, `Compra realizada` sem aspas na descrição, forma de pagamento vazia, uma linha com hífen `-R$ 5,00`, uma linha inválida (`valor` = `abc`), e duas linhas idênticas.
- [ ] **Step 2: testes de money**
```ts
expect(parseBRL('−R$ 2.013,93')).toBe(-201393)
expect(parseBRL('-R$ 5,00')).toBe(-500)
expect(parseBRL('+R$ 35,00')).toBe(3500)
expect(parseBRL('R$ 0,10')).toBe(10)
expect(() => parseBRL('abc')).toThrow()
expect(formatBRL(-201393)).toMatch(/-R\$\s2\.013,93/)
```
- [ ] **Step 3: testes do parser**
  - `parses all valid rows`: número de rows = válidas do fixture; `invalid.length === 1`.
  - `maps tipo`: `Dinheiro guardado`/`resgatado` → MOVIMENTACAO; `Pix recebido` → RECEITA; `Pix enviado`/`Compra realizada` → GASTO; tipo desconhecido com valor negativo → GASTO, positivo → RECEITA.
  - `parses date and time`: `2026-10-31,21:31` → `dataHora` com ano 2026, mês 9 (0-based), dia 31, 21:31 (horário local).
  - `strips BOM`: não lança com BOM.
  - `rejects wrong header`: `parsePicPayCsv('a,b,c\n1,2,3')` lança `InvalidPicPayFileError`.
  - `identical rows get distinct hashes`: as duas linhas idênticas têm `hash` diferentes; reparsear o mesmo arquivo gera os mesmos hashes (determinístico).
- [ ] **Step 4:** Run `npm test` → FAIL.
- [ ] **Step 5:** Implementar. Usar `papaparse` com `header: true`. Cabeçalho esperado (após remover BOM e trim): `data,hora,tipo,origem / destino,valor,forma de pagamento`. Hash = SHA-256 (`node:crypto`) de `data|hora|tipo|descricao|valor|ocorrencia`, onde `ocorrencia` é o índice (0,1,…) dessa mesma combinação dentro do arquivo.
- [ ] **Step 6:** `npm test` → PASS. Commit `feat: parser do CSV PicPay e utilitários de dinheiro`.

---

### Task 3: Categorização

**Files:** Create `src/domain/categorization.ts`, `src/domain/defaults.ts`, `tests/domain/categorization.test.ts`

**Interfaces — Produces:**
```ts
type Rule = { padrao: string; categoryId: string }
normalize(s: string): string                       // maiúsculas, sem acentos, trim
matchCategory(descricao: string, rules: Rule[]): string | null
// regra casa se normalize(descricao) contém normalize(padrao); vence a de padrao mais longo

DEFAULT_CATEGORIES: { nome: string; cor: string; tipo: TxType }[]
DEFAULT_RULES: { padrao: string; categoria: string }[]   // categoria = nome em DEFAULT_CATEGORIES
```

- [ ] **Step 1: testes**
```ts
const rules = [{padrao:'99',categoryId:'transp'},{padrao:'99 FOOD',categoryId:'alim'},
               {padrao:'uber',categoryId:'transp'}]
expect(matchCategory('99 FOOD LTDA.', rules)).toBe('alim')
expect(matchCategory('99 TECNOLOGIA', rules)).toBe('transp')
expect(matchCategory('Uber *Trip', rules)).toBe('transp')
expect(matchCategory('Padaria', rules)).toBeNull()
expect(normalize(' São Paulo ')).toBe('SAO PAULO')
```
  Mais: toda `DEFAULT_RULES[i].categoria` existe em `DEFAULT_CATEGORIES`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar. Categorias padrão (spec §4): Alimentação, Transporte, Telefone, Assinaturas, Lazer, Saúde, Moradia, Compras, Outros (GASTO); Receitas (RECEITA); Movimentação (MOVIMENTACAO). Regras: UBER, 99 → Transporte; IFOOD, 99 FOOD → Alimentação; TIM, VIVO, CLARO → Telefone; GOOGLE, NETFLIX, SPOTIFY → Assinaturas. Cores: hex distintas.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat: categorização por regras`.

> Nota: "TIM" casa por substring com descrições como "TIMOTEO"; aceito nesta fase (usuário corrige e cria regra mais específica).

---

### Task 4: Schema do banco e seed por usuário

**Files:** Create `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/seed-user.ts`, `tests/db/seed-user.test.ts`; migração gerada em `drizzle/`.

**Interfaces — Produces:**
```ts
// schema.ts (Drizzle, pgTable): categories, categoryRules, imports, transactions
// colunas conforme spec §3; valores em integer (centavos); enums pg: tx_type, tx_origin
// unique(transactions.user_id, transactions.hash_unico)
// unique(categories.user_id, categories.nome)
db  // client.ts: drizzle(postgres(process.env.DATABASE_URL!, { prepare: false }))
ensureUserDefaults(userId: string): Promise<void>  // idempotente
```

- [ ] **Step 1:** Criar projeto no Supabase (manual): copiar URL, anon key e connection string (pooler, porta 6543) para `.env.local`. Em Auth → Providers → Email, **desativar "Allow new users to sign up"**. Criar o usuário do dono em Auth → Users.
- [ ] **Step 2:** Escrever `schema.ts`. `transactions` inclui `convertidaCredito boolean default false` (usado na Fase 2) e `categoryId` nullable com `on delete set null`.
- [ ] **Step 3:** `npx drizzle-kit generate` e `npx drizzle-kit migrate` → tabelas criadas.
- [ ] **Step 4: teste de integração** (pula se `TEST_DATABASE_URL` ausente, via `describe.skipIf`): chamar `ensureUserDefaults(uuid)` duas vezes → 11 categorias e 10 regras para o usuário (sem duplicar).
- [ ] **Step 5:** Implementar `ensureUserDefaults` com `insert ... onConflictDoNothing` e regras inseridas só se o usuário tiver 0 regras.
- [ ] **Step 6:** Teste → PASS (ou SKIP sem banco de teste). Commit `feat: schema do banco e seed de categorias`.

---

### Task 5: Login e proteção de rotas

**Files:** Create `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `src/lib/auth.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/(app)/layout.tsx`

**Interfaces — Produces:**
```ts
requireUserId(): Promise<string>   // lê sessão; redireciona p/ /login se não houver;
                                   // chama ensureUserDefaults na 1ª vez (cache por request)
signIn(formData: FormData): Promise<{ error?: string }>   // server action
signOut(): Promise<void>
```

- [ ] **Step 1:** Clientes Supabase SSR seguindo o guia oficial `@supabase/ssr` para Next.js (cookies via `next/headers`).
- [ ] **Step 2:** `middleware.ts`: atualiza sessão; rota sem sessão (exceto `/login`) → redirect `/login`; `/login` com sessão → redirect `/`.
- [ ] **Step 3:** Página de login: e-mail, senha, botão "Entrar"; erro "E-mail ou senha inválidos". Sem link de cadastro.
- [ ] **Step 4:** Layout `(app)`: chama `requireUserId()`; navegação: Dashboard, Transações, Importar, Configurações, Sair.
- [ ] **Step 5: verificação manual:** `npm run dev`; `/` sem login → `/login`; senha errada → mensagem; login certo → dashboard vazio; Sair → `/login`. Conferir no banco que as categorias padrão foram criadas.
- [ ] **Step 6:** Commit `feat: login com Supabase Auth`.

---

### Task 6: Importação do CSV

**Files:** Create `src/app/(app)/importar/page.tsx`, `src/app/(app)/importar/actions.ts`, `src/app/(app)/importar/preview.tsx`, `src/domain/import-plan.ts`, `tests/domain/import-plan.test.ts`

**Interfaces:**
- Consumes: `parsePicPayCsv`, `matchCategory`, `requireUserId`, `db`.
- Produces:
```ts
// domain/import-plan.ts (puro)
type ImportPlan = { novas: (ParsedRow & { categoryId: string | null })[];
                    duplicadas: number; semCategoria: number;
                    invalidas: ParseResult['invalid'] }
buildImportPlan(parsed: ParseResult, existingHashes: Set<string>, rules: Rule[],
                categoriaPorTipo: { RECEITA: string; MOVIMENTACAO: string }): ImportPlan
// RECEITA sem regra → categoria "Receitas"; MOVIMENTACAO → "Movimentação"; GASTO sem regra → null

// actions.ts
previewImport(formData: FormData): Promise<{ plan?: ImportPlanDTO; error?: string }>
confirmImport(fileName: string, content: string): Promise<{ inseridas: number; error?: string }>
```

- [ ] **Step 1: testes de `buildImportPlan`**: hashes existentes são contados em `duplicadas` e não aparecem em `novas`; GASTO "UBER" recebe categoria da regra; GASTO desconhecido → `categoryId null` e conta em `semCategoria`; RECEITA sem regra → id de Receitas; MOVIMENTACAO → id de Movimentação; inválidas repassadas.
- [ ] **Step 2:** `npm test` → FAIL. Implementar. `npm test` → PASS.
- [ ] **Step 3:** `previewImport`: lê arquivo (máx. 2 MB), parseia, busca hashes existentes do usuário, retorna o plano. `InvalidPicPayFileError` → `error: "Arquivo não parece ser um extrato do PicPay"`.
- [ ] **Step 4:** `confirmImport`: reparseia o conteúdo no servidor (não confia no cliente), recalcula o plano e, numa transação do banco, insere `imports` + `transactions` com `onConflictDoNothing` em `(user_id, hash_unico)`. `revalidatePath('/')`.
- [ ] **Step 5:** UI: input de arquivo → prévia com contadores ("68 linhas · 5 já importadas · 12 sem categoria · 1 não reconhecida"), tabela das novas e das não reconhecidas, botão "Confirmar importação" → toast de sucesso e link para Transações.
- [ ] **Step 6: verificação manual:** importar o CSV real → contadores coerentes; importar de novo → "0 novas, 68 já importadas".
- [ ] **Step 7:** Commit `feat: importação do CSV PicPay com prévia`.

---

### Task 7: Transações e aprendizado de regras

**Files:** Create `src/app/(app)/transacoes/page.tsx`, `actions.ts`, `transaction-row.tsx`

**Interfaces:**
- Produces:
```ts
updateTransaction(id: string, data: { categoryId?: string | null; tipo?: TxType;
                  descricao?: string }): Promise<void>
createRuleFromTransaction(id: string, categoryId: string): Promise<{ aplicadas: number }>
// cria regra padrao = descricao; aplica a todas transações do usuário sem categoria
// cuja descricao casa; retorna quantas foram atualizadas
```

- [ ] **Step 1:** Página com filtros via search params: `mes=AAAA-MM` (padrão: mês mais recente com dados), `categoria`, `tipo`. Lista ordenada por data desc: data/hora, descrição, badge de tipo, select de categoria, valor (`formatBRL`, vermelho para negativo).
- [ ] **Step 2:** Ao mudar categoria: chama `updateTransaction`, depois mostra diálogo "Aplicar '<descrição>' → <categoria> nas próximas?" → Sim chama `createRuleFromTransaction` e toast "Regra criada · N transações atualizadas".
- [ ] **Step 3:** Editar tipo (GASTO/RECEITA/MOVIMENTACAO) por select.
- [ ] **Step 4:** Todas as actions validam que a transação pertence a `requireUserId()` (where `id` **e** `user_id`).
- [ ] **Step 5: verificação manual:** filtrar mês; categorizar "LUCAS..." como Lazer, aceitar regra; reimportar outro CSV com o mesmo nome → vem categorizado.
- [ ] **Step 6:** Commit `feat: listagem e edição de transações com criação de regras`.

---

### Task 8: Dashboard de gastos por categoria

**Files:** Create `src/domain/summary.ts`, `tests/domain/summary.test.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/category-donut.tsx`

**Interfaces — Produces:**
```ts
type CategoryTotal = { categoryId: string | null; nome: string; cor: string;
                       total: number /* centavos positivos */; percentual: number }
summarizeByCategory(txs: { valor: number; tipo: TxType; convertidaCredito: boolean;
                    categoryId: string | null }[], categories: Category[]): CategoryTotal[]
// considera apenas tipo GASTO e convertidaCredito=false; sem categoria → nome "Sem categoria", cor cinza;
// ordenado por total desc; percentuais somam 100 (±0,1)
```

- [ ] **Step 1: testes:** ignora RECEITA e MOVIMENTACAO; ignora `convertidaCredito`; agrupa nulos em "Sem categoria"; ordenação; soma de percentuais; lista vazia → `[]`.
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Página: seletor de mês (`?mes=`), card "Total de gastos do mês", gráfico de rosca Recharts (client component) e lista com cor, nome, valor e %. Cada item é link para `/transacoes?mes=…&categoria=…`. Estado vazio: "Nenhuma transação neste mês — importe um extrato" com link.
- [ ] **Step 4: verificação manual** com o CSV real; testar tema escuro e largura de celular (375px).
- [ ] **Step 5:** Commit `feat: dashboard de gastos por categoria`.

---

### Task 9: Configurações — categorias e regras

**Files:** Create `src/app/(app)/configuracoes/page.tsx`, `actions.ts`

**Interfaces — Produces:**
```ts
upsertCategory(data: { id?: string; nome: string; cor: string; tipo: TxType }): Promise<{ error?: string }>
deleteCategory(id: string): Promise<void>        // transações ficam sem categoria (FK set null)
upsertRule(data: { id?: string; padrao: string; categoryId: string }): Promise<{ error?: string }>
deleteRule(id: string): Promise<void>
```

- [ ] **Step 1:** Seção Categorias: lista, criar/editar (nome, cor, tipo), excluir com confirmação. Nome duplicado → "Já existe uma categoria com esse nome".
- [ ] **Step 2:** Seção Regras: lista "contém X → Categoria", criar/editar/excluir. Padrão vazio → erro.
- [ ] **Step 3:** Todas filtram por `user_id`.
- [ ] **Step 4: verificação manual:** criar categoria "Pets", regra "PETZ" → Pets; excluir categoria com transações → transações aparecem como "Sem categoria".
- [ ] **Step 5:** Commit `feat: configurações de categorias e regras`.

---

### Task 10: Deploy na Vercel

- [ ] **Step 1:** Criar repositório no GitHub e `git push` (com autorização do usuário).
- [ ] **Step 2:** Importar na Vercel; configurar `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Step 3:** No Supabase Auth → URL Configuration, adicionar o domínio da Vercel.
- [ ] **Step 4: verificação:** login em produção, importar CSV, ver dashboard. `npm test` e `npm run build` verdes localmente.
- [ ] **Step 5:** Commit de eventuais ajustes `chore: configuração de deploy`.
