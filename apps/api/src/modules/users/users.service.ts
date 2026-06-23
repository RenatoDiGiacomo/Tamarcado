import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../database/entities/user.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  /** Lookup escopado por tenant — email é único POR TENANT (DL-026). */
  findByCompanyAndEmail(
    companyId: string,
    email: string,
  ): Promise<User | null> {
    return this.repo.findOne({ where: { company_id: companyId, email } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }
}
