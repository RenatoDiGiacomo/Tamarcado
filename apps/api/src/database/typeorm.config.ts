import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./data-source-options";

/**
 * DataSource consumido pela CLI do TypeORM (migration:run / revert / generate).
 * O runtime usa as mesmas opções via DatabaseModule.
 */
export default new DataSource(buildDataSourceOptions());
