import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class MissionEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    // TODO: Add mission specific columns
    // @Column()
    // name: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
