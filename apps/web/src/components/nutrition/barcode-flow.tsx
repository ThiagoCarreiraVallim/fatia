'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  canProcessScan,
  lockAfterClose,
  lookupErrorMessage,
  nutritionApi,
  savedProductItem,
  type BarcodeLookup,
  type Food,
  type ScanCloseReason,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { BarcodeScanner, type BarcodeSource } from './barcode-scanner';
import { ScannedProductPanel, type ScannedChoice } from './scanned-product-panel';

export interface ScannedItemPayload {
  label: string;
  foodId?: number;
  foodName?: string;
  grams?: number;
  portionId?: string;
  quantity?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

interface Props {
  /** Entrega o item à refeição aberta: o drawer decide se cria a refeição ou adiciona. */
  onAdd: (payload: ScannedItemPayload) => void;
  adding: boolean;
  addError?: string;
  onCreateManually: () => void;
  /** Só aparece na câmera: no painel do produto, "Voltar" já volta para ela. */
  onBack: () => void;
}

/**
 * Leitor dentro do drawer de busca: câmera (ou código digitado) → Open Food
 * Facts → painel do produto → item na refeição.
 *
 * Mora no drawer, e não numa tela própria como no app, para herdar o contexto da
 * refeição (dia, tipo, vários itens por abertura) sem passar nada pela URL.
 */
export function BarcodeFlow({ onAdd, adding, addError, onCreateManually, onBack }: Props) {
  const qc = useQueryClient();
  // Último código consultado: a câmera repete o mesmo várias vezes por segundo.
  const lastCode = useRef<string | null>(null);
  const [result, setResult] = useState<BarcodeLookup | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const customFoods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });

  const lookup = useMutation<BarcodeLookup, Error, string>({
    mutationFn: (code) => nutritionApi.lookupBarcode(code),
    onSuccess: setResult,
    onError: (error) => setFailure(lookupErrorMessage(error)),
  });

  const save = useMutation<Food, Error, ScannedChoice>({
    mutationFn: async ({ save: input, saved }) => {
      if (saved) return saved;
      if (!input) throw new Error('Nada para guardar');
      return nutritionApi.createCustomFood(input);
    },
    onSuccess: (food, { item }) => {
      qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
      qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
      onAdd({ label: item.foodName, ...savedProductItem(food, item.grams) });
    },
  });

  const handleCode = (code: string, source: BarcodeSource) => {
    // O digitado é gesto explícito: vale mesmo repetindo o último código.
    if (source === 'camera' && !canProcessScan(code, lastCode.current)) return;
    lastCode.current = code;
    setFailure(null);
    lookup.mutate(code);
  };

  const close = (reason: ScanCloseReason) => {
    lastCode.current = lockAfterClose(lastCode.current, reason);
    setResult(null);
    setFailure(null);
    lookup.reset();
    save.reset();
  };

  const submit = (choice: ScannedChoice) => {
    if (choice.saved || choice.save) save.mutate(choice);
    else onAdd({ label: choice.item.foodName, ...choice.item });
  };

  if (result) {
    return (
      <ScannedProductPanel
        lookup={result}
        customFoods={customFoods.data ?? []}
        pending={adding || save.isPending}
        error={save.error?.message ?? addError}
        onSubmit={submit}
        onBack={() => close('dismissed')}
      />
    );
  }

  if (failure) {
    return (
      <div className="my-3 space-y-3">
        <p role="alert" className="rounded-lg bg-muted px-3 py-3 text-sm">
          {failure}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => close('rescan')}>
            Ler outro
          </Button>
          <Button className="flex-1" onClick={onCreateManually}>
            Cadastrar à mão
          </Button>
        </div>
      </div>
    );
  }

  if (lookup.isPending) {
    return (
      <p role="status" className="my-6 text-center text-sm text-muted-foreground">
        Consultando o Open Food Facts...
      </p>
    );
  }

  return (
    <>
      <BarcodeScanner onCode={handleCode} />
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Voltar para a busca
      </Button>
    </>
  );
}
