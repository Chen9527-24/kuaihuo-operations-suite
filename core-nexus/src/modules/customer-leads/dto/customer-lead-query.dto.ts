import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CUSTOMER_LEAD_FOLLOW_UP_STATUSES,
  CUSTOMER_LEAD_FOLLOW_UP_VALUES,
  CUSTOMER_LEAD_SOURCES,
} from '../customer-leads.constants';

export class CustomerLeadQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: '杭州示例科技 / 张女士 / 13800000000' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  keyword?: string;

  @ApiPropertyOptional({ example: 'SOLUTION_MATCHING', enum: CUSTOMER_LEAD_FOLLOW_UP_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_STATUSES)
  followUpStatus?: string;

  @ApiPropertyOptional({ example: 'PRODUCT_GAP', enum: CUSTOMER_LEAD_FOLLOW_UP_VALUES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_VALUES)
  followUpValue?: string;

  @ApiPropertyOptional({ example: 'INBOUND', enum: CUSTOMER_LEAD_SOURCES })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_SOURCES)
  leadSource?: string;

  @ApiPropertyOptional({ example: '王小明' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  followUpOwner?: string;

  @ApiPropertyOptional({ example: 'UNREAD', enum: ['ONLY', 'UNREAD'], description: '仅查看全部官网线索，或仅查看未读官网线索。' })
  @IsOptional()
  @IsIn(['ONLY', 'UNREAD'])
  websiteInquiry?: 'ONLY' | 'UNREAD';
}
