'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Minus, Plus, ShieldCheck } from 'lucide-react';
import {
  ApiError,
  MEAL_PHOTO_COPY,
  acceptAiConsent,
  adjustReviewGrams,
  getAiConsent,
  isAiConsentRequired,
  mealTypeForTime,
  nutritionApi,
  planHref,
  reviewItemKcal,
  reviewItemsFrom,
  reviewMealItems,
  reviewTotalKcal,
  usersApi,
  type MealRecognition,
  type MealType,
  type ReviewItem,
} from '@fatia/api-client';
import { recodificarFoto } from '@/components/chat/foto';
import { cn } from '@/lib/utils';
import { field, floating, ghostButton, inkButton } from '@/components/elements/surfaces';
import { MEAL_TYPE_LABEL } from './meal-labels';

/**
 * Foto do prato no PWA (#385, pranchas Al-M12 e Al-M10). No navegador o arquivo faz o papel
 * da câmera: `capture` abre a câmera traseira no celular, e no computador abre o seletor.
 *
 * - **Antes da primeira foto**, o aviso com o nome do provedor de verdade e o link "Como tratamos
 *   seus dados". É o mesmo aceite do chat (#384): a API recusa o reconhecimento com 403
 *   `AI_CONSENT_REQUIRED` sem ele, e esse 403 traz o aviso de volta.
 * - **Guardar a foto** (ADR 038): com a preferência ainda vazia, pergunta antes de reconhecer,
 *   porque é no reconhecimento que a API guarda (ou não) a foto. Sem o sim, ela é descartada.
 * - **Recodificar tira o EXIF** no aparelho (`recodificarFoto`); a API reprocessa de novo.
 * - **Nada grava sem a revisão**: desmarcar o que não comeu, ±10 g, total ao vivo, "Gravar no…".
 */

const CHAVE_DOS_ACEITES = ['chat', 'consent'] as const;
const CHAVE_DO_PERFIL = ['users', 'me'] as const;

async function comoBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

type Etapa = 'escolher' | 'confirmar' | 'guardar' | 'reconhecendo' | 'revisar';

export function MealPhotoScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [arquivo, setArquivo] = useState<Blob | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [refeicao, setRefeicao] = useState<MealType>(() => mealTypeForTime(new Date()));
  const [resultado, setResultado] = useState<MealRecognition | null>(null);
  const [itens, setItens] = useState<ReviewItem[]>([]);
  const [avisoDaFoto, setAvisoDaFoto] = useState<string | null>(null);
  const [pedirAceite, setPedirAceite] = useState(false);

  const aceites = useQuery({ queryKey: CHAVE_DOS_ACEITES, queryFn: getAiConsent });
  const perfil = useQuery({ queryKey: CHAVE_DO_PERFIL, queryFn: () => usersApi.me() });
  const aceito = aceites.data?.chat.accepted === true && !pedirAceite;

  // A prévia é um `blob:` local; solta a anterior quando troca e quando a tela sai.
  useEffect(() => {
    if (!previa) return;
    return () => URL.revokeObjectURL(previa);
  }, [previa]);

  const reconhecer = useMutation({
    mutationFn: async (foto: Blob) => nutritionApi.recognizeMealPhoto(await comoBase64(foto)),
    onMutate: () => setEtapa('reconhecendo'),
    onSuccess: (rec) => {
      setResultado(rec);
      setItens(reviewItemsFrom(rec));
      setEtapa('revisar');
    },
    onError: (erro) => {
      if (isAiConsentRequired(erro)) {
        // O aceite caiu (versão nova do texto): o aviso volta, e a foto continua escolhida.
        setPedirAceite(true);
        void queryClient.invalidateQueries({ queryKey: CHAVE_DOS_ACEITES });
        setEtapa('confirmar');
        return;
      }
      setEtapa('confirmar');
    },
  });

  const aceitar = useMutation({
    mutationFn: () => acceptAiConsent('chat'),
    onSuccess: (estado) => {
      queryClient.setQueryData(CHAVE_DOS_ACEITES, estado);
      setPedirAceite(false);
      seguir();
    },
  });

  const gravar = useMutation({
    mutationFn: () =>
      nutritionApi.createMeal({
        mealType: refeicao,
        eatenAt: new Date().toISOString(),
        photoFileId: resultado?.photoFileId ?? undefined,
        items: reviewMealItems(itens),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      router.push('/nutrition');
    },
  });

  /** Depois do aceite: na primeira vez, a pergunta de guardar; depois, direto ao reconhecimento. */
  function seguir() {
    if (!arquivo) return;
    if (perfil.data && perfil.data.keepMealPhotos === null) {
      setEtapa('guardar');
      return;
    }
    reconhecer.mutate(arquivo);
  }

  // A escolha de guardar as fotos. Se falha, a pergunta fica aberta com o aviso e os botões
  // voltam: a pessoa tenta de novo em vez de ficar parada sem saber.
  const guardarEscolha = useMutation({
    mutationFn: (guardar: boolean) => usersApi.updateMe({ keepMealPhotos: guardar }),
    onSuccess: (atualizado, guardar) => {
      queryClient.setQueryData(CHAVE_DO_PERFIL, atualizado);
      setAvisoDaFoto(guardar ? MEAL_PHOTO_COPY.keptYes : MEAL_PHOTO_COPY.keptNo);
      if (arquivo) reconhecer.mutate(arquivo);
    },
  });

  function escolherGuardar(guardar: boolean) {
    guardarEscolha.mutate(guardar);
  }

  async function aoEscolher(lista: FileList | null) {
    const escolhido = lista?.[0];
    if (!escolhido) return;
    reconhecer.reset();
    const jpeg = await recodificarFoto(escolhido);
    setArquivo(jpeg);
    setPrevia(URL.createObjectURL(jpeg));
    setEtapa('confirmar');
  }

  const total = useMemo(() => reviewTotalKcal(itens), [itens]);
  const nomeDaRefeicao = MEAL_TYPE_LABEL[refeicao];
  const falha =
    reconhecer.error && !isAiConsentRequired(reconhecer.error) ? reconhecer.error : null;
  const planoNecessario = falha instanceof ApiError && falha.isPlanRequired;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{MEAL_PHOTO_COPY.goesTo}</span>
        <label className="sr-only" htmlFor="refeicao-da-foto">
          Refeição
        </label>
        <select
          id="refeicao-da-foto"
          value={refeicao}
          onChange={(e) => setRefeicao(e.target.value as MealType)}
          className={cn(field, 'rounded-full px-3 py-1.5 text-sm font-semibold text-foreground')}
        >
          {(Object.keys(MEAL_TYPE_LABEL) as MealType[]).map((tipo) => (
            <option key={tipo} value={tipo}>
              {MEAL_TYPE_LABEL[tipo]}
            </option>
          ))}
        </select>
      </div>

      {previa ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização possível
        <img
          src={previa}
          alt="Foto do prato"
          className="aspect-square w-full rounded-3xl object-cover"
        />
      ) : (
        <div
          className={cn(
            field,
            'flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-3xl text-center',
          )}
        >
          <Camera size={32} aria-hidden className="text-foreground/50" />
          <p className="text-sm text-foreground/70">{MEAL_PHOTO_COPY.framing}</p>
        </div>
      )}

      {etapa === 'escolher' || etapa === 'confirmar' ? (
        <label
          className={cn(
            etapa === 'escolher' ? inkButton : ghostButton,
            'flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold',
          )}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Escolher foto do prato"
            className="sr-only"
            onChange={(e) => void aoEscolher(e.target.files)}
          />
          {etapa === 'escolher' ? 'Tirar ou escolher foto' : MEAL_PHOTO_COPY.retake}
        </label>
      ) : null}

      {etapa === 'confirmar' ? (
        <section className={cn(floating, 'flex flex-col gap-3 rounded-3xl p-5')}>
          {!aceito ? (
            <>
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-2xl bg-primary/15 text-success"
              >
                <ShieldCheck size={20} />
              </span>
              <h2 className="text-lg font-bold text-foreground">{MEAL_PHOTO_COPY.firstTitle}</h2>
              <p className="text-sm leading-relaxed text-foreground/75">
                {MEAL_PHOTO_COPY.firstBody}
              </p>
            </>
          ) : null}
          <p className="text-xs text-muted-foreground">{MEAL_PHOTO_COPY.keepNote}</p>
          <Link href="/privacy" className="text-sm font-semibold text-success underline">
            {MEAL_PHOTO_COPY.dataLink}
          </Link>
          {falha ? (
            <div role="alert" className="flex flex-col gap-2 text-sm">
              <p className="text-danger">
                {planoNecessario
                  ? 'A foto do prato faz parte do plano PRO.'
                  : 'Não consegui analisar a foto. Tente outra ou registre à mão.'}
              </p>
              <Link
                href={planoNecessario ? planHref('foto') : '/nutrition'}
                className="font-semibold text-success underline"
              >
                {planoNecessario ? 'Ver o plano PRO' : 'Registrar à mão'}
              </Link>
            </div>
          ) : null}
          {aceitar.isError ? (
            <p role="alert" className="text-xs text-danger">
              Não consegui gravar o aceite. Tente de novo.
            </p>
          ) : null}
          <button
            type="button"
            disabled={aceitar.isPending || !aceites.data}
            onClick={() => (aceito ? seguir() : aceitar.mutate())}
            className={cn(inkButton, 'rounded-full px-4 py-2.5 text-sm font-bold')}
          >
            {aceito ? MEAL_PHOTO_COPY.use : MEAL_PHOTO_COPY.acceptAndUse}
          </button>
        </section>
      ) : null}

      {etapa === 'guardar' ? (
        <section
          role="dialog"
          aria-labelledby="guardar-fotos"
          className={cn(floating, 'flex flex-col gap-3 rounded-3xl p-5')}
        >
          <h2 id="guardar-fotos" className="text-lg font-bold text-foreground">
            {MEAL_PHOTO_COPY.keepTitle}
          </h2>
          <p className="text-sm leading-relaxed text-foreground/75">{MEAL_PHOTO_COPY.keepBody}</p>
          {guardarEscolha.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {MEAL_PHOTO_COPY.keepFailed}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={guardarEscolha.isPending}
              onClick={() => escolherGuardar(true)}
              className={cn(inkButton, 'flex-1 rounded-full px-4 py-2.5 text-sm font-bold')}
            >
              {MEAL_PHOTO_COPY.keepYes}
            </button>
            <button
              type="button"
              disabled={guardarEscolha.isPending}
              onClick={() => escolherGuardar(false)}
              className={cn(ghostButton, 'flex-1 rounded-full px-4 py-2.5 text-sm')}
            >
              {MEAL_PHOTO_COPY.keepNo}
            </button>
          </div>
        </section>
      ) : null}

      {avisoDaFoto ? (
        <p role="status" className="text-xs text-muted-foreground">
          {avisoDaFoto}
        </p>
      ) : null}

      {etapa === 'reconhecendo' ? (
        <p role="status" className="text-sm text-foreground/70">
          {MEAL_PHOTO_COPY.recognizing}
        </p>
      ) : null}

      {etapa === 'revisar' ? (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-foreground">{MEAL_PHOTO_COPY.found(itens.length)}</p>
          <div className={cn(field, 'flex flex-col gap-1 rounded-3xl p-4')}>
            <div className="flex items-baseline justify-between pb-2">
              <span className="text-sm font-semibold text-foreground">{nomeDaRefeicao}</span>
              <span
                aria-label={`Total: ${total} kcal`}
                className="text-sm font-bold text-foreground"
              >
                {total} kcal
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {itens.map((r, i) => {
                const nome = r.item.nomeDoCatalogo ?? r.item.nomeReconhecido;
                const mudar = (novo: Partial<ReviewItem>) =>
                  setItens((antes) => antes.map((x, j) => (j === i ? { ...x, ...novo } : x)));
                return (
                  <li
                    key={`${r.item.nomeReconhecido}-${i}`}
                    aria-label={r.item.nomeReconhecido}
                    className="flex items-center gap-2 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={(e) => mudar({ checked: e.target.checked })}
                      aria-label={`Comi ${r.item.nomeReconhecido}`}
                      className="size-5 accent-primary"
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-sm',
                        r.checked ? 'text-foreground' : 'text-foreground/45 line-through',
                      )}
                    >
                      {nome}
                      <span className="block text-xs text-muted-foreground">
                        {reviewItemKcal(r)} kcal
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Menos 10 g de ${r.item.nomeReconhecido}`}
                      disabled={!r.checked}
                      onClick={() => mudar({ grams: adjustReviewGrams(r.grams, -1) })}
                      className={cn(ghostButton, 'grid size-11 place-items-center rounded-full')}
                    >
                      <Minus size={16} aria-hidden />
                    </button>
                    <span className="w-14 text-center text-sm font-semibold text-foreground">
                      {r.grams} g
                    </span>
                    <button
                      type="button"
                      aria-label={`Mais 10 g de ${r.item.nomeReconhecido}`}
                      disabled={!r.checked}
                      onClick={() => mudar({ grams: adjustReviewGrams(r.grams, 1) })}
                      className={cn(ghostButton, 'grid size-11 place-items-center rounded-full')}
                    >
                      <Plus size={16} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">{MEAL_PHOTO_COPY.portionWarning}</p>
          {gravar.isError ? (
            <p role="alert" className="text-xs text-danger">
              Não consegui gravar. Tente de novo.
            </p>
          ) : null}
          <button
            type="button"
            disabled={gravar.isPending || !itens.some((r) => r.checked)}
            onClick={() => gravar.mutate()}
            className={cn(inkButton, 'rounded-full px-4 py-3 text-sm font-bold')}
          >
            {MEAL_PHOTO_COPY.save(nomeDaRefeicao)}
          </button>
        </section>
      ) : null}
    </div>
  );
}
