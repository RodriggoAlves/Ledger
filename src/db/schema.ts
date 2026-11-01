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
    convertidaCredito: boolean("convertida_credito").notNull().default(false),
    hashUnico: text("hash_unico").notNull(),
  },
  (t) => [unique().on(t.userId, t.hashUnico), index().on(t.userId, t.dataHora)],
);

export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
