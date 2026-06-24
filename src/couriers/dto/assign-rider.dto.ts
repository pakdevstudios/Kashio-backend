import { IsNotEmpty, IsString } from 'class-validator';

export class AssignRiderDto {
  @IsString()
  @IsNotEmpty()
  riderId: string;
}
