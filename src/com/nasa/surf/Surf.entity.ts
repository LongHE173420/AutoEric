import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class SurfEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ nullable: true })
    accountId!: number;

    @Column({ type: 'text', nullable: true })
    surfData!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
