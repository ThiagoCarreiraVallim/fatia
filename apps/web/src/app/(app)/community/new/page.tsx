'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  GROUP_TYPES,
  groupTypeLabel,
  joinPolicyLabel,
  orgApi,
  panelHref,
  type GroupType,
  type JoinPolicy,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const POLITICAS: JoinPolicy[] = ['APPROVAL', 'OPEN', 'INVITE_ONLY'];

const schema = z.object({
  name: z.string().trim().min(2, 'Dê um nome com ao menos 2 letras').max(120),
  type: z.enum(['SPONSORED', 'SOCIAL']),
  joinPolicy: z.enum(['OPEN', 'APPROVAL', 'INVITE_ONLY']),
  description: z.string().trim().max(500),
});
type Valores = z.infer<typeof schema>;

/**
 * Criar uma comunidade. Quem cria é a dona, e cai direto no painel para
 * convidar a equipe e os membros.
 */
export default function NewCommunityPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const form = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'SPONSORED', joinPolicy: 'APPROVAL', description: '' },
  });

  const criar = useMutation({
    mutationFn: (v: Valores) =>
      orgApi.create({
        name: v.name,
        type: v.type,
        joinPolicy: v.joinPolicy,
        ...(v.description ? { description: v.description } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(panelHref(g.id, 'invites'));
    },
  });

  return (
    <div className="p-4">
      <Form {...form}>
        <form className="space-y-5" onSubmit={form.handleSubmit((v) => criar.mutate(v))}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value} onValueChange={(v) => field.onChange(v as GroupType)}>
                  <FormControl>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {GROUP_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {groupTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="joinPolicy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Como se entra</FormLabel>
                <Select value={field.value} onValueChange={(v) => field.onChange(v as JoinPolicy)}>
                  <FormControl>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {POLITICAS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {joinPolicyLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Com aprovação, quem usa o código espera você aceitar. Convites entram direto.
                </FormDescription>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição (opcional)</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {criar.isError && (
            <p role="alert" className="text-sm text-danger">
              {criar.error instanceof ApiError && criar.error.status < 500
                ? criar.error.message
                : 'Não deu para criar agora. Tente de novo.'}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={criar.isPending}>
            {criar.isPending ? 'Criando...' : 'Criar comunidade'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
