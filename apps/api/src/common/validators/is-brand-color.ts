import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { checkBrandColor } from '@fatia/design';

/**
 * Cor da comunidade (`--brand`): a mesma regra do editor de marca do painel e
 * do app, pelo mesmo código (`checkBrandColor` de @fatia/design).
 *
 * - Recusa o que não é hex e o verde perto do verde do Fatia.
 * - Aceita cor que não chega a 4,5:1 com texto branco nem escuro: o editor já
 *   mostrou o aviso e a sugestão, e a escolha é da comunidade. A resposta pode
 *   repetir o aviso com {@link brandColorWarning}.
 *
 * Pronto para o DTO de atualização da comunidade quando o campo de cor de
 * `Group` existir (#372).
 */
export function IsBrandColor(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isBrandColor',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && checkBrandColor(value).status !== 'rejected';
        },
        defaultMessage(args: ValidationArguments): string {
          const value = args.value;
          const result = checkBrandColor(typeof value === 'string' ? value : '');
          return result.status === 'rejected'
            ? result.message
            : 'Use uma cor em hexadecimal, como #FF7A1A.';
        },
      },
    });
  };
}

/** O aviso de contraste (com a sugestão de tom), ou `null` se a cor passa. */
export function brandColorWarning(value: string): { message: string; suggestion: string } | null {
  const result = checkBrandColor(value);
  return result.status === 'warning'
    ? { message: result.message, suggestion: result.suggestion }
    : null;
}
