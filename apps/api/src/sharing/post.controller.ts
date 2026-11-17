import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UserThrottlerGuard } from '../common/user-throttler.guard';
import { RequireGroupAction } from './decorators/require-group-action.decorator';
import {
  CommentParamDto,
  CreateCommentDto,
  CreatePostDto,
  FeedQueryDto,
  PinDto,
  PinOrderDto,
  PostParamDto,
  VoteDto,
  ReactionDto,
  RemovePostDto,
  ReportDto,
} from './dto/post.dto';
import { GroupRoleGuard } from './guards/group-role.guard';
import { PostService } from './post.service';

const HORA = 60 * 60_000;

/**
 * O mural da comunidade (Fase 8b). Todo membro ativo lê, reage, comenta e
 * denuncia (`post.read`); publica quem a política da comunidade deixa
 * (`post.create`, conferida de novo no service); quem modera remove, restaura
 * e fixa (`content.moderate`).
 */
@Controller('groups/:groupId/posts')
@UseGuards(GroupRoleGuard)
export class PostController {
  constructor(private readonly posts: PostService) {}

  @Get()
  @RequireGroupAction('post.read')
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() q: FeedQueryDto,
  ) {
    return this.posts.list(user.id, groupId, q.cursor, q.filter);
  }

  /** "Posts novos" desde a última visita (#394). */
  @Get('unseen')
  @RequireGroupAction('post.read')
  unseen(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ) {
    return this.posts.unseen(user.id, groupId);
  }

  @Post('seen')
  @HttpCode(200)
  @RequireGroupAction('post.read')
  seen(@CurrentUser() user: CurrentUserPayload, @Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.posts.markSeen(user.id, groupId);
  }

  /** A ordem do carrossel de avisos (prancha Pn-14). */
  @Put('pins')
  @RequireGroupAction('content.moderate')
  reorderPins(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: PinOrderDto,
  ) {
    return this.posts.reorderPins(user.id, groupId, dto.postIds);
  }

  @Post()
  @RequireGroupAction('post.create')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: HORA, limit: 10 } })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.create(user.id, groupId, dto);
  }

  @Get(':id')
  @RequireGroupAction('post.read')
  get(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.get(user.id, p.groupId, p.id);
  }

  /** O autor apaga o próprio post. */
  @Delete(':id')
  @RequireGroupAction('post.read')
  remove(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.remove(user.id, p.groupId, p.id);
  }

  /** "Ocultar este post": só para mim (prancha Cm-07). */
  @Post(':id/hide')
  @HttpCode(200)
  @RequireGroupAction('post.read')
  hide(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.hide(user.id, p.groupId, p.id);
  }

  @Put(':id/poll/vote')
  @RequireGroupAction('post.read')
  vote(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto, @Body() dto: VoteDto) {
    return this.posts.vote(user.id, p.groupId, p.id, dto.optionId);
  }

  @Delete(':id/poll/vote')
  @RequireGroupAction('post.read')
  unvote(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.vote(user.id, p.groupId, p.id, null);
  }

  @Post(':id/poll/close')
  @HttpCode(200)
  @RequireGroupAction('post.read')
  closePoll(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.closePoll(user.id, p.groupId, p.id);
  }

  @Put(':id/reaction')
  @RequireGroupAction('post.read')
  react(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: PostParamDto,
    @Body() dto: ReactionDto,
  ) {
    return this.posts.react(user.id, p.groupId, p.id, dto.kind);
  }

  @Delete(':id/reaction')
  @RequireGroupAction('post.read')
  unreact(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.react(user.id, p.groupId, p.id, null);
  }

  @Post(':id/comments')
  @RequireGroupAction('post.read')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: HORA, limit: 60 } })
  comment(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: PostParamDto,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.comment(user.id, p.groupId, p.id, dto);
  }

  @Delete(':id/comments/:commentId')
  @RequireGroupAction('post.read')
  deleteComment(@CurrentUser() user: CurrentUserPayload, @Param() p: CommentParamDto) {
    return this.posts.deleteComment(user.id, p.groupId, p.id, p.commentId);
  }

  @Post(':id/report')
  @HttpCode(200)
  @RequireGroupAction('post.read')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { ttl: HORA, limit: 30 } })
  report(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: PostParamDto,
    @Body() dto: ReportDto,
  ) {
    return this.posts.report(user.id, p.groupId, p.id, dto);
  }

  // ---------------------------------------------------------------- moderação

  @Post(':id/remove')
  @HttpCode(200)
  @RequireGroupAction('content.moderate')
  moderateRemove(
    @CurrentUser() user: CurrentUserPayload,
    @Param() p: PostParamDto,
    @Body() dto: RemovePostDto,
  ) {
    return this.posts.moderatePost(user.id, p.groupId, p.id, 'remove', dto.reason);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequireGroupAction('content.moderate')
  restore(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.moderatePost(user.id, p.groupId, p.id, 'restore');
  }

  @Post(':id/pin')
  @HttpCode(200)
  @RequireGroupAction('content.moderate')
  pin(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto, @Body() dto: PinDto) {
    return this.posts.pin(user.id, p.groupId, p.id, dto.days ?? null);
  }

  @Delete(':id/pin')
  @RequireGroupAction('content.moderate')
  unpin(@CurrentUser() user: CurrentUserPayload, @Param() p: PostParamDto) {
    return this.posts.moderatePost(user.id, p.groupId, p.id, 'unpin');
  }

  @Post(':id/comments/:commentId/remove')
  @HttpCode(200)
  @RequireGroupAction('content.moderate')
  removeComment(@CurrentUser() user: CurrentUserPayload, @Param() p: CommentParamDto) {
    return this.posts.removeComment(user.id, p.groupId, p.id, p.commentId);
  }
}
