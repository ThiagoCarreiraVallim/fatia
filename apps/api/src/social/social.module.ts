import { Module } from '@nestjs/common';
import { DailyAdherenceService } from '../nutrition/daily-adherence.service';
import { ScoreboardService } from './scoreboard.service';

/**
 * O placar dos desafios (Fase 8a). Só cálculo: nenhuma rota mora aqui — os
 * desafios, as permissões e o isolamento ficam em `sharing/challenge.service.ts`.
 * A aderência à meta de nutrição vem de `nutrition/`, que devolve só datas.
 */
@Module({
  providers: [ScoreboardService, DailyAdherenceService],
  exports: [ScoreboardService],
})
export class SocialModule {}
