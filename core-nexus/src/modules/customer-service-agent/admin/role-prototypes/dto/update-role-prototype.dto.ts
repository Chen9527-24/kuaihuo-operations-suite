import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator';
import { CUSTOMER_SERVICE_ROLE_STATUSES } from '../../../shared/constants/customer-service-foundation.constant';

export class UpdateCustomerServiceRolePrototypeDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  revision!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  languageStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  servicePosture?: string;

  @ApiPropertyOptional({ type: Object, nullable: true, description: 'HVE V1.8 typed RoleSpeakerProfileV1' })
  @IsOptional()
  @IsObject()
  speakerProfile?: Record<string, unknown> | null;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ROLE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ROLE_STATUSES)
  status?: string;
}
