'use client';

import { useState } from 'react';
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
  type ShareScope,
} from '@fatia/api-client';
import { RequiredScopesField } from '@/components/community/required-scopes-field';
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

const JOIN_POLICIES: JoinPolicy[] = ['APPROVAL', 'OPEN', 'INVITE_ONLY'];

const schema = z.object({
  name: z.string().trim().min(2, 'Dê um nome com ao menos 2 letras').max(120),
  type: z.enum(['SPONSORED', 'SOCIAL']),
  joinPolicy: z.enum(['OPEN', 'APPROVAL', 'INVITE_ONLY']),
  description: z.string().trim().max(500),
});
type FormValues = z.infer<typeof schema>;

/**
 * Criar uma comunidade. Quem cria é a dona, e cai direto no painel para
 * convidar a equipe e os membros.
 */
export default function NewCommunityPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: 'SPONSORED', joinPolicy: 'APPROVAL', description: '' },
  });
  // Fora do zod: são toggles, sem o que validar além do tipo.
  const [requiredScopes, setRequiredScopes] = useState<ShareScope[]>([]);

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      orgApi.create({
        name: v.name,
        type: v.type,
        joinPolicy: v.joinPolicy,
        ...(v.description ? { description: v.description } : {}),
        requiredSharingScopes: requiredScopes,
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
        <form className="space-y-5" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
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
                    {JOIN_POLICIES.map((p) => (
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
          <RequiredScopesField
            value={requiredScopes}
            onChange={setRequiredScopes}
            hint="Quem entrar como membro já vem com isso marcado e não consegue desmarcar; o resto continua escolha de cada um. A equipe (profissionais e criadores) não precisa. Nada marcado: ninguém é obrigado a compartilhar."
          />
          {create.isError && (
            <p role="alert" className="text-sm text-danger">
              {create.error instanceof ApiError && create.error.status < 500
                ? create.error.message
                : 'Não deu para criar agora. Tente de novo.'}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={create.isPending}>
            {create.isPending ? 'Criando...' : 'Criar comunidade'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
