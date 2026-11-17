/**
 * O relógio dos circuitos (#380) mora em `@fatia/design` (`circuit-timer.ts`)
 * para a API recalcular o resultado com as mesmas contas da tela: o `dist/`
 * CommonJS dele já é o que a API consome. Aqui só o caminho de sempre.
 */
export {
  MAX_CIRCUIT_EVENTS,
  circuitAlarms,
  circuitCue,
  circuitResult,
  circuitSegments,
  circuitState,
  circuitTotals,
  type CircuitAlarm,
  type CircuitConfigInput,
  type CircuitCue,
  type CircuitDefinition,
  type CircuitDoneReason,
  type CircuitEvent,
  type CircuitEventType,
  type CircuitExerciseTotal,
  type CircuitFormat,
  type CircuitItem,
  type CircuitPhase,
  type CircuitResult,
  type CircuitRun,
  type CircuitState,
  type CircuitStatus,
} from '@fatia/design';
