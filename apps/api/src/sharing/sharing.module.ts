import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AccessAuditService } from './access-audit.service';
import { ProfessionalAccessService } from './professional-access.service';
import { ProfessionalLinkService } from './professional-link.service';

/**
 * Toda a lógica de vínculo profissional do produto (ADR 014).
 *
 * Sem controller e sem tool de propósito: esta issue (#153) entrega o modelo e
 * as invariantes. Convite é #154, consentimento operável é #155, painel é #157.
 *
 * Os módulos de domínio **não** importam este módulo. A dependência corre no
 * outro sentido: quem lê em nome de outro chama `assertReadable`, recebe um
 * `userId`, e daí em diante usa os services de domínio como qualquer dono usa.
 */
@Module({
  imports: [CommonModule],
  providers: [ProfessionalAccessService, ProfessionalLinkService, AccessAuditService],
  exports: [ProfessionalAccessService, ProfessionalLinkService],
})
export class SharingModule {}
