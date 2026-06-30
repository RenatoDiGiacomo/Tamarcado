import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * Convite de equipe (AC1). `access_level` nunca é `owner` — não se convida um
 * Dono (FR-I3 / DL-029 item 4); a titularidade é transferida manualmente.
 */
export class InviteUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsIn(["manager", "basic"])
  access_level!: "manager" | "basic";

  @IsBoolean()
  attends_clients!: boolean;
}
