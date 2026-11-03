import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const txType = pgEnum("tx_type", ["GASTO", "RECEITA", "MOVIMENTACAO"]);
export const txOrigin = pgEnum("tx_origin", ["CSV", "MANUAL"]);
export const purchaseType = pgEnum("purchase_type", ["COMPRA", "ESTORNO"]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    nome: text("nome").notNull(),
    cor: text("cor").notNull(),
    tipo: txType("tipo").notNull(),
  },
  (t) => [unique().on(t.userId, t.nome)],
);

export const categoryRules = pgTable("category_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  padrao: text("padrao").notNull(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
});

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  nomeArquivo: text("nome_arquivo").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  linhasTotal: integer("linhas_total").notNull(),
  linhasNovas: integer("linhas_novas").notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    dataHora: timestamp("data_hora").notNull(),
    descricao: text("descricao").notNull(),
    tipoOriginal: text("tipo_original").notNull(),
    formaPagamento: text("forma_pagamento"),
    valor: integer("valor").notNull(),
    tipo: txType("tipo").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    origem: txOrigin("origem").notNull(),
    hashUnico: text("hash_unico").notNull(),
  },
  (t) => [unique().on(t.userId, t.hashUnico), index().on(t.userId, t.dataHora)],
);

export const creditCards = pgTable(
  "credit_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /** Banco do importador de fatura (por enquanto só "PICPAY"). */
    banco: text("banco").notNull().default("PICPAY"),
    nome: text("nome").notNull(),
    diaFechamento: integer("dia_fechamento").notNull(),
    diaVencimento: integer("dia_vencimento").notNull(),
  },
  (t) => [unique().on(t.userId, t.banco)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    /** "AAAA-MM" do mês de fechamento. */
    mes: text("mes").notNull(),
    fechamento: timestamp("fechamento").notNull(),
    vencimento: timestamp("vencimento").notNull(),
    paga: boolean("paga").notNull().default(false),
    pagaEm: timestamp("paga_em", { withTimezone: true }),
    /** Importação que trouxe esta fatura; null = projetada. Sem FK para evitar ciclo com invoice_imports. */
    importId: uuid("import_id"),
    /** Importação cuja linha de pagamento marcou esta fatura como paga. */
    pagaPorImportId: uuid("paga_por_import_id"),
  },
  (t) => [unique().on(t.cardId, t.mes)],
);

export const invoiceImports = pgTable("invoice_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => creditCards.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  nomeArquivo: text("nome_arquivo").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  totalLancamentos: integer("total_lancamentos").notNull(),
  linhas: integer("linhas").notNull(),
});

export const creditPurchases = pgTable(
  "credit_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    importId: uuid("import_id")
      .notNull()
      .references(() => invoiceImports.id, { onDelete: "cascade" }),
    tipo: purchaseType("tipo").notNull(),
    /** Identifica a mesma compra entre faturas (ver domain/invoice-lines.ts). */
    chave: text("chave").notNull(),
    descricao: text("descricao").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** Valor da parcela × parcelas; negativo no estorno. */
    valorTotal: integer("valor_total").notNull(),
    parcelas: integer("parcelas").notNull(),
    /** Primeira parcela vista pelo app; as anteriores não existem como linhas. */
    parcelaInicial: integer("parcela_inicial").notNull(),
    dataCompra: timestamp("data_compra").notNull(),
    cartaoFinal: text("cartao_final"),
  },
  (t) => [index().on(t.userId), unique().on(t.cardId, t.chave)],
);

export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => creditPurchases.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    numero: integer("numero").notNull(),
    valor: integer("valor").notNull(),
    confirmadaPorImportId: uuid("confirmada_por_import_id"),
    canceladaPorImportId: uuid("cancelada_por_import_id"),
  },
  (t) => [index().on(t.userId), index().on(t.invoiceId)],
);

/** Um cofrinho do PicPay, criado a partir do nome que aparece no extrato. */
export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    nome: text("nome").notNull(),
    /** Centésimos de %: 10000 = 100% do CDI. */
    percentualCdi: integer("percentual_cdi").notNull().default(10000),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.nome)],
);

/** Saldo real informado pelo usuário em um dia (00:00 UTC, como as datas do extrato). */
export const investmentSnapshots = pgTable(
  "investment_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    investmentId: uuid("investment_id")
      .notNull()
      .references(() => investments.id, { onDelete: "cascade" }),
    data: timestamp("data").notNull(),
    saldo: integer("saldo").notNull(),
    informadoEm: timestamp("informado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.investmentId, t.data), index().on(t.userId)],
);

/** Cache global do CDI do Banco Central (série 4389). */
export const cdiRates = pgTable("cdi_rates", {
  /** "AAAA-MM-DD" da taxa publicada. */
  data: text("data").primaryKey(),
  /** Centésimos de %: 1490 = 14,90% a.a. */
  taxaAnual: integer("taxa_anual").notNull(),
  buscadoEm: timestamp("buscado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** CDI informado manualmente pelo usuário; vence o do Banco Central. */
export const cdiOverrides = pgTable("cdi_overrides", {
  userId: uuid("user_id").primaryKey(),
  taxaAnual: integer("taxa_anual").notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type CreditCard = typeof creditCards.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceImport = typeof invoiceImports.$inferSelect;
export type CreditPurchase = typeof creditPurchases.$inferSelect;
export type Installment = typeof installments.$inferSelect;
