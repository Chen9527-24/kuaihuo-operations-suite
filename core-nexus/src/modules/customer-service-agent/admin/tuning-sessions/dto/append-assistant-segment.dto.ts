import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AppendCustomerServiceAssistantSegmentDto {
  @ApiProperty({ description: '同一轮回复组编码，由调用端生成' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  replyGroupId!: string;

  @ApiProperty({ minimum: 0, maximum: 9 })
  @IsInt()
  @Min(0)
  @Max(9)
  segmentIndex!: number;

  @ApiProperty({ maximum: 4000 })
  @IsString()
  @MaxLength(4000)
  content!: string;

  @ApiProperty({ required: false, description: '触发本轮回复的客户消息 clientMessageId；若已有更新客户消息，取消后续段' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  anchorClientMessageId?: string;

  @ApiProperty({ required: false, maximum: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientMessageId?: string;
}
