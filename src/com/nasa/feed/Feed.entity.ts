import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class FeedEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ nullable: true })
    accountId!: number;

    @Column({ type: 'text', nullable: true })
    feedData!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
