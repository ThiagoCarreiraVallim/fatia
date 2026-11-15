import { Platform } from 'react-native';

/**
 * Ponto de extensão da etapa "Passos sem digitar" (Onb-P1, #371): ler os passos
 * do Apple Saúde (iOS) ou do Health Connect (Android).
 *
 * As bibliotecas nativas de saúde não rodam no Expo Go; enquanto o app não tem
 * um dev build com elas, `available` é `false` e a etapa some do onboarding
 * (o fluxo já trata isso: `FlowContext.healthAvailable`). Quando entrarem, a
 * leitura vai aqui, carregada só onde existe (sem quebrar o Expo Go), e os
 * passos são gravados com a fonte `APPLE_HEALTH`/`HEALTH_CONNECT`, que a API
 * de passos já aceita.
 */
export interface HealthStepsSource {
  available: boolean;
  /** "Apple Saúde" ou "Health Connect". */
  name: string;
  /** Pede a permissão de leitura de passos; `true` = liberou. */
  requestAccess: () => Promise<boolean>;
}

export function healthStepsSource(): HealthStepsSource {
  return {
    available: false,
    name: Platform.OS === 'ios' ? 'Apple Saúde' : 'Health Connect',
    requestAccess: async () => false,
  };
}
