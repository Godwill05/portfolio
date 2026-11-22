import { Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthenticatedUser } from '../auth/types';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('unread') unread?: string) {
    return this.notifications.list(user.id, unread === 'true');
  }

  @Get('count')
  async count(@CurrentUser() user: AuthenticatedUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user.id, id);
    return { success: true };
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: AuthenticatedUser) {
    await this.notifications.markAllRead(user.id);
    return { success: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.remove(user.id, id);
    return { success: true };
  }
}
