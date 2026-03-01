import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class NotificationEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ nullable: true })
    accountId!: number;

    @Column({ nullable: true })
    title!: string;

    @Column({ nullable: true })
    content!: string;

    @Column({ default: false })
    isRead!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
