import { Global, Module } from '@nestjs/common';
import { FaviconController } from './favicon.controller';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  controllers: [FaviconController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class CommonModule {}
