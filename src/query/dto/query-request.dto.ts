import { IsString, MinLength } from 'class-validator';

export class QueryRequestDto {
  @IsString()
  @MinLength(1)
  question!: string;
}
