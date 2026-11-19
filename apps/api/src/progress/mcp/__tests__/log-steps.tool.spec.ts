import { StepSource } from '@prisma/client';
import { LogStepsTool } from '../log-steps.tool';
import type { StepLogService } from '../../step-log.service';

/**
 * `log_steps` é registro à mão pela IA (#395, ADR 047): a fonte não é do cliente.
 * O schema não oferece `source`, e um `source` que chegue mesmo assim é descartado.
 */
describe('log_steps', () => {
  it('não aceita fonte no input e grava sempre como manual', async () => {
    const logWithDayTotal = jest.fn().mockResolvedValue({ stepLogId: 's1' });
    const tool = new LogStepsTool({ logWithDayTotal } as unknown as StepLogService);

    expect(Object.keys(tool.inputSchema)).not.toContain('source');
    await tool.execute(
      { steps: 12_000, source: StepSource.APPLE_HEALTH } as never,
      { userId: 'u1', timezone: 'America/Sao_Paulo' } as never,
    );
    expect(logWithDayTotal.mock.calls[0][0]).not.toHaveProperty('source');
  });
});
