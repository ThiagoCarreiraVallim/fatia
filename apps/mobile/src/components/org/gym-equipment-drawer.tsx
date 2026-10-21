import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CUSTOM_EQUIPMENT_MAX_LENGTH,
  customEquipmentProblem,
  groupExerciseApi,
  groupsApi,
  MAX_CUSTOM_EQUIPMENT,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
  FormMessage,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { EquipmentChip, EquipmentChooser } from '@/components/workout/equipment-chooser';
import { toggled } from '@/components/workout/equipment';
import { cores } from '@/theme/cores';
import { apiMessage, orgKeys } from './org-panel';

const FIELD_CLASS =
  'min-h-[44px] rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground';

/**
 * O equipamento da academia, no painel: a lista inteira por categoria, com
 * busca, e os equipamentos que a academia nomeia por conta própria.
 *
 * Drawer e não card na tela: são sessenta e tantos itens, e a busca precisa
 * ficar à mão enquanto a lista rola. Montado na `DrawerLayer` da tela de
 * exercícios do painel (ver o cabeçalho de `ui/drawer.tsx`); lê o grupo e a
 * bancada do cache das consultas que a tela já fez.
 *
 * Só o dono salva (`group.update` na API). A equipe vê a lista sem mexer.
 */
export function GymEquipmentDrawer({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const grupo = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
    enabled: open,
  });
  const bancada = useQuery({
    queryKey: orgKeys.exercises(groupId),
    queryFn: () => groupExerciseApi.list(groupId),
    enabled: open,
  });
  const dono = grupo.data?.role === 'OWNER';

  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [proprios, setProprios] = useState<string[]>([]);
  const [novo, setNovo] = useState('');
  const [problema, setProblema] = useState<string | null>(null);

  // Reespelha o que está salvo a cada abertura, e quando os dados chegam.
  // Ajuste durante o render, e não num efeito (#187).
  const salvo = open ? bancada.data : undefined;
  const [espelhado, setEspelhado] = useState<typeof salvo>(undefined);
  if (salvo !== espelhado) {
    setEspelhado(salvo);
    if (salvo) {
      setMarcados(new Set(salvo.equipment));
      setProprios(salvo.customEquipment);
      setBusca('');
      setNovo('');
      setProblema(null);
    }
  }

  const mudou =
    !!salvo &&
    (marcados.size !== salvo.equipment.length ||
      salvo.equipment.some((e) => !marcados.has(e)) ||
      proprios.join('\n') !== salvo.customEquipment.join('\n'));

  const salvar = useMutation({
    mutationFn: () => groupExerciseApi.setEquipment(groupId, [...marcados], proprios),
    onSuccess: () => {
      toast.show({ message: 'Equipamento salvo.' });
      void qc.invalidateQueries({ queryKey: orgKeys.exercises(groupId) });
      onOpenChange(false);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para salvar agora.') }),
  });

  function adicionar() {
    const p = customEquipmentProblem(novo, proprios);
    setProblema(p);
    if (p) return;
    setProprios([...proprios, novo.replace(/\s+/g, ' ').trim()]);
    setNovo('');
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['90%']}>
      <DrawerHeader>
        <DrawerTitle>Equipamento da academia</DrawerTitle>
        <DrawerDescription>
          {dono
            ? `O filtro "Na minha academia" mostra o que dá para fazer com isto. Peso corporal vale sempre. ${marcados.size + proprios.length} marcado(s).`
            : 'Só o dono muda. O filtro "Na minha academia" usa esta lista.'}
        </DrawerDescription>
        <DrawerTextInput
          value={busca}
          onChangeText={setBusca}
          accessibilityLabel="Buscar equipamento"
          placeholder="Buscar: smith, esteira, polia…"
          placeholderTextColor={cores.placeholder}
          selectionColor={cores.primary}
          className={FIELD_CLASS}
        />
      </DrawerHeader>

      <DrawerScrollView
        className="flex-1 px-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="gap-5 py-2">
          {dono ? (
            <View className="gap-2 rounded-2xl border border-border bg-card p-3">
              <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
                Equipamentos próprios
              </Text>
              <Text className="text-xs text-muted-foreground">
                {`O que a lista não tem, com o nome que a casa usa. Até ${MAX_CUSTOM_EQUIPMENT}.`}
              </Text>
              {proprios.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {proprios.map((p) => (
                    <EquipmentChip
                      key={p}
                      label={p}
                      on
                      onRemove={() => setProprios(proprios.filter((x) => x !== p))}
                    />
                  ))}
                </View>
              ) : null}
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <DrawerTextInput
                    value={novo}
                    onChangeText={(t) => {
                      setNovo(t);
                      if (problema) setProblema(null);
                    }}
                    onSubmitEditing={adicionar}
                    returnKeyType="done"
                    maxLength={CUSTOM_EQUIPMENT_MAX_LENGTH}
                    accessibilityLabel="Nome do equipamento próprio"
                    placeholder="Ex.: Hack 45° da casa"
                    placeholderTextColor={cores.placeholder}
                    selectionColor={cores.primary}
                    className={FIELD_CLASS}
                  />
                </View>
                <Button size="sm" variant="outline" onPress={adicionar}>
                  Adicionar
                </Button>
              </View>
              {problema ? <FormMessage>{problema}</FormMessage> : null}
            </View>
          ) : null}

          <EquipmentChooser
            query={busca}
            disabled={!dono}
            // Para o dono, os próprios ficam no cartão acima, onde se apagam.
            custom={dono ? [] : proprios}
            isSelected={(k) => marcados.has(k) || proprios.includes(k)}
            onPick={(k) => setMarcados(toggled(marcados, k))}
          />
        </View>
      </DrawerScrollView>

      <DrawerFooter className="flex-row">
        {dono ? (
          <Button
            className="flex-1"
            disabled={!mudou}
            loading={salvar.isPending}
            onPress={() => salvar.mutate()}
          >
            Salvar equipamento
          </Button>
        ) : null}
        <Button variant="ghost" onPress={() => onOpenChange(false)}>
          {dono ? 'Cancelar' : 'Fechar'}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}
