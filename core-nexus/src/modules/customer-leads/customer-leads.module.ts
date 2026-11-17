import { Module } from '@nestjs/common';
import { CustomerLeadsController } from './customer-leads.controller';
import { CustomerLeadsService } from './customer-leads.service';

@Module({
  controllers: [CustomerLeadsController],
  providers: [CustomerLeadsService],
})
export class CustomerLeadsModule {}
