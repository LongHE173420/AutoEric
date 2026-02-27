import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { ENV } from "../config/env";

@Entity({ name: ENV.USERS_TABLE })
export class AccountEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ unique: true })
    phone!: string;

    @Column()
    password!: string;

    @Column({ name: "deviceId" })
    deviceId!: string;

    @Column({ nullable: true })
    firstName?: string;

    @Column({ nullable: true })
    lastName?: string;

    @Column({ type: "enum", enum: ["MALE", "FEMALE", "OTHER"], nullable: true })
    gender?: string;

    @Column({ type: "date", nullable: true })
    dateOfBirth?: string;

    @Column({ type: "tinyint", default: 1, width: 1 })
    trustRequired!: boolean;

    @Column({ type: "tinyint", default: 0, width: 1 })
    revoked!: boolean;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column({ type: "text", nullable: true })
    refreshToken?: string;

    @Column({ type: "text", nullable: true })
    accessToken?: string;

    @Column({ type: "text", nullable: true })
    trustedDevices?: string;
}
