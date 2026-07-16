// Popula process.env com apps/api/.env antes de montar as opções — a CLI do
// TypeORM roda fora do Nest, então o @nestjs/config não entra. Ver load-env.ts.
import "../load-env";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./data-source-options";

/**
 * DataSource consumido pela CLI do TypeORM (migration:run / revert / generate).
 * O runtime usa as mesmas opções via DatabaseModule.
 */
export default new DataSource(buildDataSourceOptions());