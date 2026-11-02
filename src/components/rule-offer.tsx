"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Oferta de criar regra "descrição → categoria" depois de categorizar um item. */
export type RuleOffer = {
  descricao: string;
  nome: string;
  /** Onde a regra também é aplicada na hora: transações do extrato ou compras do cartão. */
  alvo: "transações" | "compras";
  criar: () => Promise<{ aplicadas?: number; error?: string }>;
};

const RuleOfferContext = createContext<((offer: RuleOffer) => void) | null>(null);

/**
 * Mantém o diálogo "Criar regra?" acima da lista: numa lista filtrada (ex.: "Sem categoria"),
 * a linha recategorizada sai no refresh da action, e o diálogo não pode sair junto.
 */
export function RuleOfferProvider({ children }: { children: React.ReactNode }) {
  const [offer, setOffer] = useState<RuleOffer | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!offer) return;
    startTransition(async () => {
      const res = await offer.criar();
      if (res.error) toast.error(res.error);
      else toast.success(`Regra criada · ${res.aplicadas} ${offer.alvo} atualizadas`);
      setOffer(null);
    });
  }

  return (
    <RuleOfferContext.Provider value={setOffer}>
      {children}
      <Dialog open={offer !== null} onOpenChange={(open) => !open && !pending && setOffer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar regra?</DialogTitle>
            <DialogDescription>
              Aplicar &ldquo;{offer?.descricao}&rdquo; → {offer?.nome} nas próximas importações e nas {offer?.alvo} sem
              categoria?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOffer(null)} disabled={pending}>
              Não
            </Button>
            <Button onClick={onConfirm} disabled={pending}>
              Sim, criar regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RuleOfferContext.Provider>
  );
}

export function useRuleOffer(): (offer: RuleOffer) => void {
  const offer = useContext(RuleOfferContext);
  if (!offer) throw new Error("useRuleOffer precisa de um RuleOfferProvider acima");
  return offer;
}
