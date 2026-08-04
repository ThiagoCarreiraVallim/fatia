/**
 * Inadimplência **degrada**, nunca bloqueia (#158).
 *
 * Função pura, e é o ponto: a degradação é uma **leitura**, não um efeito
 * colateral. Nada é desligado, nada é apagado, nenhuma tela do aluno muda de
 * texto. A única diferença entre uma academia em dia e uma devendo é o nível de
 * IA patrocinada que a Fatia banca — e o aluno que traz a própria IA (#164) nem
 * percebe.
 *
 * O que a issue proíbe, e o que a maioria dos SaaS B2B2C faz: cortar o acesso do
 * aluno enquanto a academia não paga. O app é grátis para ele; ele não pode
 * virar refém de uma disputa comercial entre a academia e a Fatia, e o dado que
 * ele perderia de vista é o histórico de saúde dele.
 */

/**
 * Estado comercial da assinatura do grupo.
 *
 * União de string, e não enum do Prisma, porque esta fatia não toca
 * `schema.prisma` (a migration está proposta na PR). Quando `SubscriptionStatus`
 * existir, o tipo aqui vira o import dele e nada mais muda.
 */
export type StatusDeAssinatura = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

/** Nenhuma IA patrocinada. Não é bloqueio: é o app inteiro, sem a IA por conta da academia. */
export const SEM_IA = 'none';

export interface AssinaturaParaTier {
  status: StatusDeAssinatura;
  /** Faixa contratada. É ela que a cota da #135 vai dimensionar. */
  tier: string;
  /**
   * Até quando a inadimplência ainda não degrada. Boleto compensa em dias úteis
   * e webhook atrasa: degradar no mesmo dia do vencimento puniria a academia por
   * latência do meio de pagamento.
   */
  gracePeriodEndsAt?: Date | null;
}

export interface DecisaoDeTier {
  /** {@link SEM_IA} ou a faixa contratada. */
  tier: string;
  /** Verdadeiro quando a faixa contratada existe mas não está valendo agora. */
  degraded: boolean;
  motivo: 'ativa' | 'carencia' | 'sem_assinatura' | 'inadimplente' | 'cancelada';
}

/**
 * O nível de IA patrocinada deste grupo, agora.
 *
 * **Nunca lança.** Um `throw` aqui viraria erro numa rota de aluno — ou seja,
 * bloqueio por acidente, que é exatamente o que a issue proíbe. Entrada
 * desconhecida devolve {@link SEM_IA}, que é o pior caso comercial e o melhor
 * caso para o aluno: ele continua com registro manual, PWA, app nativo e o MCP
 * com a IA dele.
 */
export function decideAiTier(
  assinatura: AssinaturaParaTier | null | undefined,
  agora: Date = new Date(),
): DecisaoDeTier {
  if (!assinatura) return { tier: SEM_IA, degraded: false, motivo: 'sem_assinatura' };

  switch (assinatura.status) {
    case 'ACTIVE':
    case 'TRIALING':
      return { tier: assinatura.tier, degraded: false, motivo: 'ativa' };

    case 'PAST_DUE': {
      const carencia = assinatura.gracePeriodEndsAt;
      if (carencia && carencia > agora) {
        return { tier: assinatura.tier, degraded: false, motivo: 'carencia' };
      }
      return { tier: SEM_IA, degraded: true, motivo: 'inadimplente' };
    }

    case 'CANCELED':
      return { tier: SEM_IA, degraded: true, motivo: 'cancelada' };

    default:
      // Inalcançável pelo tipo — e presente porque o `default` é o que segura o
      // dia em que o enum ganhar um status novo no banco e um deploy antigo o
      // ler. Cair em `SEM_IA` é degradar; cair em `throw` seria bloquear.
      return { tier: SEM_IA, degraded: true, motivo: 'sem_assinatura' };
  }
}
