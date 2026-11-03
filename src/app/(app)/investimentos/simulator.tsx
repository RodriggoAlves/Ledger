"use client";

import { useMemo, useState } from "react";
import { StackedArea } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parsePercent, parseReais } from "@/domain/input";
import { formatBRL } from "@/domain/money";
import { MAX_MESES, simulate } from "@/domain/simulator";

const toInput = (centesimos: number) => (centesimos / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function Field({
  label,
  value,
  onChange,
  invalid,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  suffix?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <span className="flex items-center gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-invalid={invalid || undefined} />
        {suffix && <span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  );
}

const anos = (meses: number) => {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  return [a && `${a} ${a === 1 ? "ano" : "anos"}`, m && `${m} ${m === 1 ? "mês" : "meses"}`].filter(Boolean).join(" e ");
};

/** Simulador de rendimento com aporte mensal, calculado no navegador. */
export function Simulator({ cdiAnual }: { cdiAnual: number }) {
  const [inicial, setInicial] = useState("1.000,00");
  const [aporte, setAporte] = useState("500,00");
  const [prazo, setPrazo] = useState("24");
  const [percentual, setPercentual] = useState("100");
  const [cdi, setCdi] = useState(toInput(cdiAnual));

  const input = {
    inicial: parseReais(inicial),
    aporteMensal: parseReais(aporte),
    meses: /^\d+$/.test(prazo.trim()) ? Number(prazo) : null,
    percentual: parsePercent(percentual),
    cdiAnual: parsePercent(cdi),
  };
  const prazoOk = input.meses !== null && input.meses >= 1 && input.meses <= MAX_MESES;
  const valid = Object.values(input).every((v) => v !== null) && prazoOk;

  const r = useMemo(
    () =>
      valid
        ? simulate({
            inicial: input.inicial!,
            aporteMensal: input.aporteMensal!,
            meses: input.meses!,
            percentual: input.percentual!,
            cdiAnual: input.cdiAnual!,
          })
        : null,
    [valid, input.inicial, input.aporteMensal, input.meses, input.percentual, input.cdiAnual],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card className="gap-4 px-(--card-spacing)">
        <h2 className="text-lg font-semibold">Cenário</h2>
        <Field label="Valor inicial" value={inicial} onChange={setInicial} invalid={input.inicial === null} suffix="R$" />
        <Field label="Aporte mensal" value={aporte} onChange={setAporte} invalid={input.aporteMensal === null} suffix="R$" />
        <Field label="Prazo" value={prazo} onChange={setPrazo} invalid={!prazoOk} suffix="meses" />
        <Field label="Rendimento" value={percentual} onChange={setPercentual} invalid={input.percentual === null} suffix="% do CDI" />
        <Field label="CDI anual" value={cdi} onChange={setCdi} invalid={input.cdiAnual === null} suffix="% a.a." />
        <p className="text-xs text-muted-foreground">
          Estimativa com o CDI constante, 21 dias úteis por mês e IR regressivo por aporte. Não considera IOF nem feriados.
        </p>
      </Card>

      {r ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total aportado", value: r.aportado },
              { label: "Saldo bruto", value: r.bruto },
              { label: "Rendimento bruto", value: r.rendimento },
              { label: "Líquido de IR", value: r.liquido, hint: `IR estimado: ${formatBRL(r.ir)}` },
            ].map((s) => (
              <Card key={s.label} size="sm" className="gap-1 px-(--card-spacing)">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <span className="font-display text-xl font-semibold tabular-nums">{formatBRL(s.value)}</span>
                {s.hint && <span className="text-xs text-muted-foreground">{s.hint}</span>}
              </Card>
            ))}
          </div>
          <Card className="gap-4 px-(--card-spacing)">
            <h2 className="text-lg font-semibold">Mês a mês, em {anos(input.meses!)}</h2>
            <StackedArea
              label="Evolução do saldo simulado: aportado mais rendimento"
              data={r.linhas.map((l) => ({ label: `mês ${l.mes}`, aportado: l.aportado, rendimento: Math.max(0, l.bruto - l.aportado) }))}
              series={[
                { key: "aportado", label: "Aportado", color: "var(--series-1)" },
                { key: "rendimento", label: "Rendimento", color: "var(--series-3)" },
              ]}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Mês</th>
                    <th className="py-2 text-right font-medium">Aportado</th>
                    <th className="py-2 text-right font-medium">Rendimento</th>
                    <th className="py-2 text-right font-medium">Saldo bruto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {r.linhas
                    .filter((l) => l.mes > 0 && (l.mes % 12 === 0 || l.mes === input.meses))
                    .map((l) => (
                      <tr key={l.mes}>
                        <td className="py-2">{anos(l.mes)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBRL(l.aportado)}</td>
                        <td className="py-2 text-right tabular-nums">{formatBRL(l.bruto - l.aportado)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{formatBRL(l.bruto)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="px-(--card-spacing) text-muted-foreground">
          Confira os campos: valores em reais (ex.: 1.000,00), prazo entre 1 e {MAX_MESES} meses e percentuais como 100 ou 14,9.
        </Card>
      )}
    </div>
  );
}
