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
