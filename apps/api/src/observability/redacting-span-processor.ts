import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { redactSpanAttributes } from './telemetry-redaction';

/**
 * Envelopa um `SpanProcessor` e sanea os atributos do span **antes** de entregá-lo ao delegado.
 *
 * Por que como processador, e não como hook da instrumentação de HTTP: um hook só protege a
 * instrumentação que o declarou. Aqui todo span de todas as instrumentações passa por um único
 * ponto — inclusive as que alguém acrescentar depois sem saber desta regra. Segurança que
 * depende de lembrar não é segurança.
 */
export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    // `attributes` é `readonly` só na referência; o objeto em si é mutável, e este é o último
    // instante em que dá para alterá-lo antes do exportador serializar.
    redactSpanAttributes(span.attributes);
    this.delegate.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
