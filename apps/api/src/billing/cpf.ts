/**
 * CPF válido pelos dígitos verificadores. Só valida: o Fatia não guarda CPF,
 * passa adiante ao Asaas uma vez (ADR 024). A mesma regra existe no
 * `@fatia/api-client` (`isCpfValid`), para o erro aparecer antes do envio.
 */
export function somenteDigitos(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function cpfValido(entrada: string): boolean {
  const cpf = somenteDigitos(entrada);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10]);
}

/** CNPJ válido pelos dígitos verificadores (assentos de comunidade, ADR 025). */
export function cnpjValido(entrada: string): boolean {
  const cnpj = somenteDigitos(entrada);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string) => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return (
    digito(cnpj.slice(0, 12)) === Number(cnpj[12]) && digito(cnpj.slice(0, 13)) === Number(cnpj[13])
  );
}

/** CPF ou CNPJ: quem paga uma comunidade pode ser pessoa ou empresa. */
export function documentoValido(entrada: string): boolean {
  return cpfValido(entrada) || cnpjValido(entrada);
}
