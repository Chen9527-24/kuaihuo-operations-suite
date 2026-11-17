import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, Length, Min } from 'class-validator';

export class RollbackCustomerServiceAssetVersionDto {
  @ApiProperty({ minimum: 1, description: '当前资产 revision，用于防止并发覆盖' })
  @IsInt()
  @Min(1)
  assetRevision!: number;

  @ApiProperty({ example: true, description: '必须显式确认回滚' })
  @IsBoolean()
  confirmRollback!: boolean;

  @ApiProperty({ description: '回滚原因，写入新版本摘要' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
