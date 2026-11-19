import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { MemberNoteView } from './member-file.types';

export interface MyNoteView {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MemberNoteService {
  constructor(private readonly prisma: PrismaService) {}

  list(_viewerId: string, _groupId: string, _membershipId: string): Promise<MemberNoteView[]> {
    throw new Error('não implementado');
  }

  create(
    _viewerId: string,
    _groupId: string,
    _membershipId: string,
    _text: string,
  ): Promise<MemberNoteView> {
    throw new Error('não implementado');
  }

  update(
    _viewerId: string,
    _groupId: string,
    _membershipId: string,
    _noteId: string,
    _text: string,
  ): Promise<MemberNoteView> {
    throw new Error('não implementado');
  }

  remove(
    _viewerId: string,
    _groupId: string,
    _membershipId: string,
    _noteId: string,
  ): Promise<void> {
    throw new Error('não implementado');
  }

  mine(_userId: string, _groupId: string): Promise<MyNoteView[]> {
    throw new Error('não implementado');
  }
}
