import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateCredentialDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
