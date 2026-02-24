import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class PostEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    // TODO: Add post specific columns
    // @Column()
    // content: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
