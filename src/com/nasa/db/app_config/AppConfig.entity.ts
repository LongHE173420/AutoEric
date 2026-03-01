import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class AppConfigEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ nullable: true })
    accountId!: number;

    @Column({ nullable: true })
    firebaseToken!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
