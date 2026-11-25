import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { storageConfig } from './config/storage.config';
import { validateEnv } from './config/validate-env';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { AutoRepliesModule } from './modules/auto-replies/auto-replies.module';
import { DialogueRecordsModule } from './modules/dialogue-records/dialogue-records.module';
import { CustomerLeadsModule } from './modules/customer-leads/customer-leads.module';
import { DictsModule } from './modules/dicts/dicts.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { CustomerServiceAgentModule } from './modules/customer-service-agent/customer-service-agent.module';
import { MediaAccountsModule } from './modules/media-accounts/media-accounts.module';
import { OperationLogsModule } from './modules/operation-logs/operation-logs.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RobotsModule } from './modules/robots/robots.module';
import { RolesModule } from './modules/roles/roles.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WechatModule } from './modules/wechat/wechat.module';
import { SmsModule } from './modules/sms/sms.module';
import { WebsiteModule } from './modules/website/website.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      load: [appConfig, authConfig, storageConfig],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    AiModule,
    AuthModule,
    DialogueRecordsModule,
    AutoRepliesModule,
    UsersModule,
    FilesModule,
    HealthModule,
    CustomerServiceAgentModule,
    RbacModule,
    DictsModule,
    TenantsModule,
    PermissionsModule,
    RolesModule,
    MediaAccountsModule,
    CustomerLeadsModule,
    WechatModule,
    SmsModule,
    WebsiteModule,
    RobotsModule,
    OperationLogsModule,
  ],
})
export class AppModule {}
