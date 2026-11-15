'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  canProcessScan,
  lockAfterClose,
  lookupErrorMessage,
  nutritionApi,
  savedProductItem,
  ApiError,
  type BarcodeLookup,
  type CustomFoodForm,
  type Food,
  type ScanCloseReason,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarcodeScanner, type BarcodeSource } from './barcode-scanner';
import { LabelReader, useLabelReading } from './label-reader';
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
  source?: 'BARCODE';
}

type ProductLookup = Exclude<BarcodeLookup, { status: 'own' }>;
type Tab = 'code' | 'label';

interface Props {
  /** Entrega o item à refeição aberta: o drawer decide se cria a refeição ou adiciona. */
  onAdd: (payload: ScannedItemPayload) => void;
  adding: boolean;
  addError?: string;
  /** Cadastrar à mão, com o código lido (quando houver) já no formulário. */
  onCreateManually: (barcode: string) => void;
  /** O código é de um alimento da própria pessoa: vai direto para a quantidade. */
  onPickOwn: (food: Food) => void;
  /** O rótulo lido pela foto, para conferir no formulário de alimento próprio. */
  onLabelRead: (form: CustomFoodForm) => void;
  /**
   * Quantos itens a refeição aberta já recebeu. Quando sobe, o produto entrou e
   * o leitor volta para a próxima embalagem (o drawer aberto pelo atalho de
   * escanear continua no leitor).
   */
  addedCount?: number;
  /** Só aparece na câmera: no painel do produto, "Voltar" já volta para ela. */
  onBack: () => void;
}

/**
 * Leitor dentro do drawer de busca: câmera (ou código digitado) → os alimentos
 * da pessoa → Open Food Facts → painel do produto → item na refeição. A aba
 * "Rótulo" lê a tabela nutricional pela foto (#375); sem câmera de código, o
 * digitado e a foto cobrem o mesmo caminho.
 *
 * Mora no drawer, e não numa tela própria como no app, para herdar o contexto da
 * refeição (dia, tipo, vários itens por abertura) sem passar nada pela URL.
 */
export function BarcodeFlow({
  onAdd,
  adding,
  addError,
  onCreateManually,
  onPickOwn,
  onLabelRead,
  addedCount = 0,
  onBack,
}: Props) {
  const labelAccess = useLabelReading();
  const [tab, setTab] = useState<Tab>('code');
  /** Código que não estava em lugar nenhum: segue para o rótulo e o cadastro. */
  const [unknownCode, setUnknownCode] = useState('');
  const qc = useQueryClient();
  // Último código consultado: a câmera repete o mesmo várias vezes por segundo.
  const lastCode = useRef<string | null>(null);
  const [result, setResult] = useState<ProductLookup | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Painel fechado sem registrar. A trava do código continua valendo. */
  const [dismissed, setDismissed] = useState(false);

  // Ajuste durante o render, e não num efeito (#187). A trava do último código
  // fica: a embalagem que acabou de entrar costuma seguir enquadrada, e relê-la
  // reabriria o painel do produto já registrado.
  const [seenAdded, setSeenAdded] = useState(addedCount);
  if (seenAdded !== addedCount) {
    setSeenAdded(addedCount);
    setResult(null);
    setFailure(null);
  }

  const customFoods = useQuery({
    queryKey: ['nutrition', 'custom-foods'],
    queryFn: () => nutritionApi.customFoods(),
  });

  const lookup = useMutation<BarcodeLookup, Error, string>({
    mutationFn: (code) => nutritionApi.lookupBarcode(code),
    onSuccess: (found) => {
      // O código vinculado a um alimento da pessoa vence o Open Food Facts.
      if (found.status === 'own') onPickOwn(found.food);
      else setResult(found);
    },
    onError: (error, code) => {
      setUnknownCode(error instanceof ApiError && error.status === 404 ? code : '');
      setFailure(lookupErrorMessage(error));
    },
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
    setDismissed(false);
    setFailure(null);
    lookup.mutate(code);
  };

  const close = (reason: ScanCloseReason) => {
    lastCode.current = lockAfterClose(lastCode.current, reason);
    setDismissed(reason === 'dismissed');
    setResult(null);
    setFailure(null);
    setUnknownCode('');
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
        {unknownCode && labelAccess !== 'hidden' && (
          <Button
            className="min-h-12 w-full"
            onClick={() => {
              setFailure(null);
              lookup.reset();
              setTab('label');
            }}
          >
            Ler o rótulo pela foto
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => close('rescan')}>
            Ler outro
          </Button>
          <Button
            variant={unknownCode && labelAccess !== 'hidden' ? 'outline' : 'default'}
            className="flex-1"
            onClick={() => onCreateManually(unknownCode)}
          >
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

  const tabs =
    labelAccess === 'hidden' ? null : (
      <div
        role="tablist"
        aria-label="Como ler"
        className="my-3 grid grid-cols-2 rounded-full bg-muted p-1"
      >
        {(
          [
            ['code', 'Código'],
            ['label', 'Rótulo'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'min-h-10 rounded-full text-sm',
              tab === key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    );

  if (tab === 'label' && labelAccess !== 'hidden') {
    return (
      <>
        {tabs}
        {unknownCode && (
          <p className="text-xs text-muted-foreground">{`Código ${unknownCode}: o alimento fica ligado a ele.`}</p>
        )}
        <LabelReader barcode={unknownCode} locked={labelAccess === 'locked'} onRead={onLabelRead} />
        <Button variant="ghost" className="w-full" onClick={onBack}>
          Voltar para a busca
        </Button>
      </>
    );
  }

  return (
    <>
      {tabs}
      <BarcodeScanner onCode={handleCode} />
      {dismissed && (
        // O código descartado segue travado, senão a câmera o releria na hora.
        // Como a embalagem costuma seguir enquadrada, sem este botão quem voltou
        // por engano ficaria sem como reler o mesmo produto. Como no app.
        <div className="my-2 space-y-2 text-center">
          <p className="text-xs text-muted-foreground">
            Leitura descartada. Aponte para outro produto ou toque abaixo.
          </p>
          <Button variant="outline" className="w-full" onClick={() => close('rescan')}>
            Ler de novo
          </Button>
        </div>
      )}
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Voltar para a busca
      </Button>
    </>
  );
}
