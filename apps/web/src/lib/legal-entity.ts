/**
 * Quem responde pelos dados da instância — o controlador da LGPD —, lido do
 * ambiente da instância, e não escrito no código.
 *
 * O Fatia é software livre: um nome fixo nas páginas legais faria toda
 * instância auto-hospedada declarar o controlador errado. A instância pública
 * preenche `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_DOCUMENT` (o CNPJ) e `DPO_EMAIL`;
 * sem o nome, as páginas dizem genericamente que é quem opera a instância.
 *
 * Lido por requisição (as páginas legais são dinâmicas), para trocar a
 * variável no painel valer sem novo build.
 */
export interface LegalEntity {
  name: string;
  document: string | null;
  dpoEmail: string | null;
}

export function legalEntity(env: NodeJS.ProcessEnv = process.env): LegalEntity | null {
  const name = env.LEGAL_ENTITY_NAME?.trim();
  if (!name) return null;
  return {
    name,
    document: env.LEGAL_ENTITY_DOCUMENT?.trim() || null,
    dpoEmail: env.DPO_EMAIL?.trim() || null,
  };
}
