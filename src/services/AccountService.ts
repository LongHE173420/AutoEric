import { AccountRepository } from "../repo/AccountRepository";
import { AccountEntity } from "../entities/Account.entity";

import {Log} from "../utils/log";
export class AccountService {

 

  private readonly logger = Log.getLogger("AccountService")


  private readonly repo = new AccountRepository();

  public  getAccount(
    limit: number = 200
  ): Promise<AccountEntity[]> {
    this.logger.debug("GET_ENABLED_ACCOUNTS", limit);
    const accounts =  this.repo.findEnabledAccounts(limit);
    return accounts;
  }
}
