import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType } from '../../common/constants/domain';
import { Notification } from '../../database/entities/user.entity';

@Injectable()
export class NotificationService {
  constructor(@InjectRepository(Notification) private readonly repo: Repository<Notification>) {}

  async create(
    userId: string,
    input: { type: NotificationType; title: string; body: string; link?: string; meta?: Record<string, unknown> },
  ): Promise<Notification> {
    return this.repo.save(
      this.repo.create({
        userId,
        type: input.type,
        title: input.title.slice(0, 180),
        body: input.body.slice(0, 600),
        link: input.link?.slice(0, 300) ?? null,
        meta: input.meta ?? null,
      }),
    );
  }

  async list(userId: string, onlyUnread = false) {
    const where = onlyUnread ? { userId, isRead: false } : { userId };
    return this.repo.find({ where, order: { createdAt: 'DESC' }, take: 50 });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.repo.update({ id, userId }, { isRead: true });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.update({ userId, isRead: false }, { isRead: true });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repo.delete({ id, userId });
  }
}
