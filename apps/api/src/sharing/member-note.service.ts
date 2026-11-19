import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupRole, MembershipStatus, type Prisma } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { MAX_MEMBER_NOTE } from './dto/member-file.dto';
import { resolveMemberTarget } from './member-file-target';
import type { MemberNoteView } from './member-file.types';

const NOTE_NOT_FOUND = 'Note not found';

/** A nota como a pessoa vê no app: sem id de ninguém, só o nome de quem escreveu. */
export interface MyNoteView {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const NOTE_SELECT = {
  id: true,
  text: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { name: true } },
} satisfies Prisma.MemberNoteSelect;

type NoteRow = Prisma.MemberNoteGetPayload<{ select: typeof NOTE_SELECT }>;

function cleanText(text: string): string {
  const clean = text.trim();
  if (!clean) throw new BadRequestException('Escreva a anotação.');
  if (clean.length > MAX_MEMBER_NOTE) {
    throw new BadRequestException(`A anotação vai até ${MAX_MEMBER_NOTE} caracteres.`);
  }
  return clean;
}

/**
 * Anotações da equipe na ficha (#402, parte da #301).
 *
 * Não são privadas: a pessoa lê as dela no app (`mine`), e a ficha avisa "O
 * aluno vê estas anotações". Moram na comunidade (`groupId`) e somem quando a
 * pessoa sai dela (`MembershipService.endMembership`). Escrever é `member.note`;
 * editar e apagar é do autor ou do dono.
 */
@Injectable()
export class MemberNoteService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewerId: string, groupId: string, membershipId: string): Promise<MemberNoteView[]> {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.file',
    );
    return this.listFor(viewerId, target.viewerRole, groupId, target.subjectUserId);
  }

  /** Para a ficha, que já resolveu a pessoa e o papel de quem olha. */
  async listFor(
    viewerId: string,
    viewerRole: GroupRole,
    groupId: string,
    subjectUserId: string,
  ): Promise<MemberNoteView[]> {
    const rows = await this.prisma.memberNote.findMany({
      where: { groupId, subjectUserId },
      select: NOTE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.view(r, viewerId, viewerRole));
  }

  async create(
    viewerId: string,
    groupId: string,
    membershipId: string,
    text: string,
  ): Promise<MemberNoteView> {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.note',
    );
    const row = await this.prisma.memberNote.create({
      data: {
        groupId,
        subjectUserId: target.subjectUserId,
        authorId: viewerId,
        text: cleanText(text),
      },
      select: NOTE_SELECT,
    });
    return this.view(row, viewerId, target.viewerRole);
  }

  async update(
    viewerId: string,
    groupId: string,
    membershipId: string,
    noteId: string,
    text: string,
  ): Promise<MemberNoteView> {
    const { target } = await this.editable(viewerId, groupId, membershipId, noteId);
    const row = await this.prisma.memberNote.update({
      where: { id: noteId },
      data: { text: cleanText(text) },
      select: NOTE_SELECT,
    });
    return this.view(row, viewerId, target.viewerRole);
  }

  async remove(
    viewerId: string,
    groupId: string,
    membershipId: string,
    noteId: string,
  ): Promise<void> {
    await this.editable(viewerId, groupId, membershipId, noteId);
    await this.prisma.memberNote.deleteMany({ where: { id: noteId } });
  }

  /**
   * As notas da equipe sobre quem chama, numa comunidade em que ela está ativa.
   * Comunidade de que não faz parte responde como inexistente.
   */
  async mine(userId: string, groupId: string): Promise<MyNoteView[]> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true },
    });
    if (!m || m.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Group not found');
    const rows = await this.prisma.memberNote.findMany({
      where: { groupId, subjectUserId: userId, visibleToSubject: true },
      select: NOTE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      authorName: r.author?.name ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** A nota é da pessoa da URL, nesta comunidade, e quem pede é o autor ou o dono. */
  private async editable(viewerId: string, groupId: string, membershipId: string, noteId: string) {
    const target = await resolveMemberTarget(
      this.prisma,
      viewerId,
      groupId,
      membershipId,
      'member.note',
    );
    const note = await this.prisma.memberNote.findFirst({
      where: { id: noteId, groupId, subjectUserId: target.subjectUserId },
      select: { authorId: true },
    });
    if (!note) throw new NotFoundException(NOTE_NOT_FOUND);
    if (!canEditNote(viewerId, target.viewerRole, note.authorId)) {
      throw new ForbiddenException('Só quem escreveu, ou o dono, muda esta anotação');
    }
    return { target };
  }

  private view(r: NoteRow, viewerId: string, viewerRole: GroupRole): MemberNoteView {
    return {
      id: r.id,
      text: r.text,
      authorName: r.author?.name ?? null,
      isMine: r.authorId === viewerId,
      canEdit: canEditNote(viewerId, viewerRole, r.authorId),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

function canEditNote(viewerId: string, role: GroupRole, authorId: string | null): boolean {
  return authorId === viewerId || role === GroupRole.OWNER;
}
