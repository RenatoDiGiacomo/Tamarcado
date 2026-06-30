import { IsArray, IsString } from "class-validator";

/** Define quais profissionais executam o serviço (AC4). Lista pode ser vazia. */
export class SetProfessionalsDto {
  @IsArray()
  @IsString({ each: true })
  professionalIds!: string[];
}
