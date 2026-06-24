import type { Repository } from "typeorm";
import { TenantContextService } from "../tenant/tenant-context.service";
import { TenantAwareRepository } from "./tenant-aware.repository";

interface Row {
  id: string;
  company_id: string;
  name: string;
}

class RowRepo extends TenantAwareRepository<Row> {
  constructor(repo: Repository<Row>, ctx: TenantContextService) {
    super(repo, ctx);
  }
}

describe("TenantAwareRepository", () => {
  const ctx = new TenantContextService();
  let repo: { find: jest.Mock; findOne: jest.Mock; count: jest.Mock; save: jest.Mock };
  let scoped: RowRepo;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    scoped = new RowRepo(repo as unknown as Repository<Row>, ctx);
  });

  it("injeta company_id no where de findAll", async () => {
    await ctx.run("A", () => scoped.findAll({ where: { name: "x" } as never }));
    expect(repo.find).toHaveBeenCalledWith({
      where: { name: "x", company_id: "A" },
    });
  });

  it("findById busca por id + company_id atual", async () => {
    await ctx.run("A", () => scoped.findById("99"));
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: "99", company_id: "A" },
    });
  });

  it("count é escopado pelo tenant", async () => {
    await ctx.run("A", () => scoped.count());
    expect(repo.count).toHaveBeenCalledWith({ where: { company_id: "A" } });
  });

  it("save carimba o company_id do tenant atual", async () => {
    await ctx.run("A", () => scoped.save({ name: "novo" } as never));
    expect(repo.save).toHaveBeenCalledWith({ name: "novo", company_id: "A" });
  });

  it("lança se não houver tenant em contexto", () => {
    expect(() => scoped.findAll()).toThrow();
  });
});
