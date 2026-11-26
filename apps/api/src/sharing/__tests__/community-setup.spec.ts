import { GroupKind, GroupType, SetupStep } from '@fatia/db';
import {
  communitySlug,
  computeSetup,
  setupItemKeys,
  stepsFromSettings,
  type SetupFacts,
} from '../community-setup';

/** O checklist de primeiros passos do dono (#372): regra pura. */
describe('checklist de primeiros passos (#372)', () => {
  const nova: SetupFacts = {
    type: GroupType.SPONSORED,
    kind: GroupKind.GYM,
    brand: false,
    requiredScopes: false,
    team: false,
    members: false,
    challenge: false,
    plan: false,
    equipment: false,
  };

  it('academia tem 9 itens; personal e social não têm Equipamentos', () => {
    expect(setupItemKeys(GroupType.SPONSORED, GroupKind.GYM)).toEqual([
      'CREATE',
      'BRAND',
      'CATEGORIES',
      'TEAM',
      'MEMBERS',
      'CHALLENGE',
      'PLAN',
      'EQUIPMENT',
      'ACCESS',
    ]);
    expect(setupItemKeys(GroupType.SPONSORED, GroupKind.COACH)).not.toContain('EQUIPMENT');
    expect(setupItemKeys(GroupType.SOCIAL, null)).toHaveLength(8);
    // Patrocinada antiga, sem tipo: era tratada como academia.
    expect(setupItemKeys(GroupType.SPONSORED, null)).toContain('EQUIPMENT');
  });

  it('recém-criada: só "Criar" feito, a marca pendente e o guia aparece', () => {
    const s = computeSetup(nova, [], null, null);
    expect(s.done).toBe(1);
    expect(s.total).toBe(9);
    expect(s.brandPending).toBe(true);
    expect(s.visible).toBe(true);
    expect(s.items[0]).toEqual({ key: 'CREATE', done: true, auto: true });
  });

  it('o dado marca sozinho, sem "Desfazer"; o marcado à mão pode desfazer', () => {
    const s = computeSetup({ ...nova, brand: true, challenge: true }, [SetupStep.PLAN], null, null);
    const item = (k: string) => s.items.find((i) => i.key === k)!;
    expect(item('BRAND')).toEqual({ key: 'BRAND', done: true, auto: true });
    expect(item('CHALLENGE')).toEqual({ key: 'CHALLENGE', done: true, auto: true });
    expect(item('PLAN')).toEqual({ key: 'PLAN', done: true, auto: false });
    expect(s.brandPending).toBe(false);
    expect(s.done).toBe(4);
  });

  it('completo, o guia some; "Repetir o guia" mostra; fechado, não aparece', () => {
    const tudo: SetupFacts = {
      ...nova,
      brand: true,
      requiredScopes: true,
      team: true,
      members: true,
      challenge: true,
      plan: true,
      equipment: true,
    };
    const pronta = computeSetup(tudo, [SetupStep.ACCESS], null, null);
    expect(pronta.complete).toBe(true);
    expect(pronta.visible).toBe(false);
    expect(computeSetup(tudo, [SetupStep.ACCESS], null, new Date()).visible).toBe(true);
    expect(computeSetup(nova, [], new Date(), null).visible).toBe(false);
  });

  it('marca de passo que não vale para o tipo não conta', () => {
    const s = computeSetup({ ...nova, kind: GroupKind.COACH }, [SetupStep.EQUIPMENT], null, null);
    expect(s.total).toBe(8);
    expect(s.done).toBe(1);
  });

  it('salvar a configuração marca categorias, acesso e marca', () => {
    expect(stepsFromSettings({ requiredSharingScopes: [] })).toEqual([SetupStep.CATEGORIES]);
    expect(stepsFromSettings({ postPolicy: 'TEAM_ONLY' })).toEqual([SetupStep.ACCESS]);
    expect(stepsFromSettings({ brandColor: '#ff7a1a' })).toEqual([SetupStep.BRAND]);
    expect(stepsFromSettings({ brandColor: null, name: 'x' } as never)).toEqual([]);
  });

  it('endereço sem acento, sem símbolo, com no mínimo 3 letras', () => {
    expect(communitySlug('Academia Demo')).toBe('academia-demo');
    expect(communitySlug('  Força & Saúde!! ')).toBe('forca-saude');
    expect(communitySlug('AD')).toBe('ad-comunidade');
    expect(communitySlug('???')).toBe('comunidade');
    expect(communitySlug('a'.repeat(50))).toHaveLength(40);
  });
});
