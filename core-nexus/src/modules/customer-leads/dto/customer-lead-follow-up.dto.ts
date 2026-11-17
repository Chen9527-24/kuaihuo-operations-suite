import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CUSTOMER_LEAD_FOLLOW_UP_METHODS,
  CUSTOMER_LEAD_FOLLOW_UP_STATUSES,
  CUSTOMER_LEAD_FOLLOW_UP_VALUES,
} from '../customer-leads.constants';

export class CustomerLeadFollowUpQueryDto extends PaginationDto {}

export class CreateCustomerLeadFollowUpDto {
  @ApiProperty({ example: '2026-07-08T02:30:00.000Z', description: '本次实际跟进发生时间。每次登记都会新增一条不可被后续记录覆盖的历史。' })
  @IsDateString()
  followedUpAt!: string;

  @ApiPropertyOptional({ example: 'WECHAT', enum: CUSTOMER_LEAD_FOLLOW_UP_METHODS })
  @IsOptional()
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_METHODS)
  followUpMethod?: string | null;

  @ApiPropertyOptional({ example: '王小明', description: '本次实际跟进人，可为空；填写后会同步为该客户当前跟进人。' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  followUpOwner?: string | null;

  @ApiProperty({ example: '客户确认目前重点是售后咨询分流，愿意在拿到演示环境后组织运营团队试用。', description: '本次沟通内容、结论和关键待确认项。' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  summary!: string;

  @ApiProperty({ example: 'DEMO_OR_TRIAL', enum: CUSTOMER_LEAD_FOLLOW_UP_STATUSES, description: '本次跟进后的当前推进状态快照。' })
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_STATUSES)
  followUpStatus!: string;

  @ApiProperty({ example: 'HIGH', enum: CUSTOMER_LEAD_FOLLOW_UP_VALUES, description: '本次跟进后的继续跟进价值判断快照。' })
  @IsIn(CUSTOMER_LEAD_FOLLOW_UP_VALUES)
  followUpValue!: string;

  @ApiPropertyOptional({ example: '2026-07-15T01:30:00.000Z', description: '本次沟通之后计划的下次跟进时间；终态客户会自动清空该待办。' })
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;

  @ApiPropertyOptional({ example: '发送演示环境账号，并在一周后收集试用意见。' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nextFollowUpPlan?: string | null;
}
