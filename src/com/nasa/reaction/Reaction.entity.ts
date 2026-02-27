import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class ReactionEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ nullable: true })
    accountId!: number;

    @Column({ nullable: true })
    postId!: string;

    @Column({ nullable: true })
    reactionType!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
