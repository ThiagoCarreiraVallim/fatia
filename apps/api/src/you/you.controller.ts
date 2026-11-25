import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { IdeaArea } from '@fatia/db';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { IDEA_MAX, TUTORIAL_ID, YouService } from './you.service';

class MarkNewsReadDto {
  /** Ausente = todas ("Marcar tudo como lido"). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  ids?: string[];
}

class TutorialSeenDto {
  @IsString()
  @Matches(TUTORIAL_ID)
  id!: string;
}

class IdeaDto {
  @IsString()
  @MaxLength(IDEA_MAX + 200)
  body!: string;

  /** "Onde ajudaria" (#413, Pn-27): só o formulário da equipe manda. */
  @IsOptional()
  @IsEnum(IdeaArea)
  area?: IdeaArea;
}

/**
 * Novidades, tutoriais e ideias (Você, #387), e as novidades do painel da
 * equipe (#413). Sem tool MCP, por decisão das issues.
 */
@Controller()
export class YouController {
  constructor(private readonly you: YouService) {}

  @Get('news')
  news(@CurrentUser() user: CurrentUserPayload) {
    return this.you.news(user.id);
  }

  @Post('news/read')
  @HttpCode(200)
  markNewsRead(@CurrentUser() user: CurrentUserPayload, @Body() dto: MarkNewsReadDto) {
    return this.you.markNewsRead(user.id, dto.ids);
  }

  @Get('panel/news')
  panelNews(@CurrentUser() user: CurrentUserPayload) {
    return this.you.panelNews(user.id);
  }

  @Post('panel/news/read')
  @HttpCode(200)
  markPanelNewsRead(@CurrentUser() user: CurrentUserPayload, @Body() dto: MarkNewsReadDto) {
    return this.you.markPanelNewsRead(user.id, dto.ids);
  }

  @Get('tutorials/seen')
  tutorialsSeen(@CurrentUser() user: CurrentUserPayload) {
    return this.you.tutorialsSeen(user.id);
  }

  @Post('tutorials/seen')
  @HttpCode(200)
  markTutorialSeen(@CurrentUser() user: CurrentUserPayload, @Body() dto: TutorialSeenDto) {
    return this.you.markTutorialSeen(user.id, dto.id);
  }

  @Post('feedback/ideas')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 10 } })
  sendIdea(@CurrentUser() user: CurrentUserPayload, @Body() dto: IdeaDto) {
    return this.you.sendIdea(user.id, dto.body, dto.area);
  }
}
