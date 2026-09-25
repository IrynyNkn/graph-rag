import { IsString, MinLength } from 'class-validator';

export class IngestRequestDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
