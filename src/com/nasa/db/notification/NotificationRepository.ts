import { AppDataSource } from "../../config/data-source";
import { NotificationEntity } from "./Notification.entity";

export const NotificationRepository = AppDataSource.getRepository(NotificationEntity).extend({
    async findUnreadByAccountId(accountId: number): Promise<NotificationEntity[]> {
        return this.find({ where: { accountId, isRead: false }, order: { createdAt: 'DESC' } });
    },

    async markAsRead(id: number): Promise<void> {
        await this.update(id, { isRead: true });
    }
});
