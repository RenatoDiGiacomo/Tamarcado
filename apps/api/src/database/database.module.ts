import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { buildDataSourceOptions } from "./data-source-options";

/**
 * Configura a conexão MySQL via TypeORM para toda a aplicação.
 * Schema evolui só por migrations (synchronize: false).
 */
@Module({
  imports: [TypeOrmModule.forRoot(buildDataSourceOptions())],
})
export class DatabaseModule {}
