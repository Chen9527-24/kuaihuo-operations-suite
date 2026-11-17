import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../../common/dto/pagination.dto';
import { CUSTOMER_SERVICE_ASSET_STATUSES, CUSTOMER_SERVICE_ASSET_TYPES } from '../../../shared/constants/customer-service-foundation.constant';

export class CustomerServiceAssetQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ASSET_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ASSET_TYPES)
  assetType?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SERVICE_ASSET_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_SERVICE_ASSET_STATUSES)
  status?: string;
}
