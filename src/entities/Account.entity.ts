import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";
import { ENV } from "../config/env";

@Entity({ name: ENV.USERS_TABLE })
export class AccountEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ name: ENV.USERS_USERNAME_COL })
    phone!: string;

    @Column({ name: ENV.USERS_PASSWORD_COL })
    password!: string;

    constructor(id?: number, phone?: string, password?: string) {
        if (id !== undefined) this.id = id;
        if (phone !== undefined) this.phone = phone;
        if (password !== undefined) this.password = password;
    }
}
