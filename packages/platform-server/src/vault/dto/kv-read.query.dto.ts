import { IsString, MinLength } from 'class-validator';

export class KvReadQueryDto {
  @IsString()
  @MinLength(1)
  path!: string;

  @IsString()
  @MinLength(1)
  key!: string;
}
