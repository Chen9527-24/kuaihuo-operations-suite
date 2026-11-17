import { Injectable } from '@nestjs/common';
import { CurrentUserPayload } from '../../../../common/types/current-user.type';
import { CUSTOMER_SERVICE_PRODUCT } from '../../shared/constants/customer-service-product.constant';
import { CustomerServiceRuntimeMode } from '../../shared/enums/customer-service-runtime-mode.enum';
import { CustomerServiceOverview } from './types/customer-service-overview.type';

@Injectable()
export class CustomerServiceOverviewService {
  getOverview(user: CurrentUserPayload): CustomerServiceOverview {
    return {
      product: CUSTOMER_SERVICE_PRODUCT,
      stage: 'V5_3_STRATEGY_CONFIGURATION',
      tenantScoped: Boolean(user.tenantId),
      legacyIndustryAiDetached: true,
      customerVisibleSendingEnabled: false,
      businessWriteActionsEnabled: false,
      enabledRuntimeModes: [CustomerServiceRuntimeMode.SIMULATION],
      plannedRuntimeModes: Object.values(CustomerServiceRuntimeMode),
      capabilities: [
        { key: 'isolated-menu', name: '独立一级菜单', status: 'READY' },
        { key: 'isolated-api', name: '独立 V5 API', status: 'READY' },
        { key: 'isolated-permission', name: '独立权限域', status: 'READY' },
        { key: 'intent-flow-center', name: '客户意图、事件与处理流程中心', status: 'READY' },
        { key: 'ali-settings', name: '阿梨设置与旗舰母版', status: 'READY' },
        { key: 'industry-capability', name: '行业与品类树', status: 'READY' },
        { key: 'merchant-role', name: '商家角色与模块实例', status: 'READY' },
        { key: 'runtime-compiler', name: '统一策略与运行契约编译器', status: 'READY' },
        { key: 'response-rules', name: '确定性回复与规则', status: 'READY' },
        { key: 'formal-foundation', name: '正式初始化数据', status: 'READY' },
        { key: 'message-understanding', name: '消息理解与多主题识别', status: 'READY' },
        { key: 'reply-planning', name: '结构化回复规划', status: 'READY' },
        { key: 'model-generation', name: '模拟智能生成', status: 'READY' },
        { key: 'quality-gate', name: '质量门与定向重写', status: 'READY' },
        { key: 'multi-turn-tuning', name: '多轮上下文回复调优', status: 'READY' },
        { key: 'reply-tuning', name: '回复调优与校准记录', status: 'READY' },
        { key: 'scoped-calibration', name: '校准证据与配置调整建议', status: 'READY' },
        { key: 'humanity-decision', name: '动机、心境、关系与商业开放度决策', status: 'READY' },
        { key: 'optional-business-goal', name: '可选经营目标与目的感控制', status: 'READY' },
        { key: 'ali-flagship', name: '阿梨全行业旗舰真人感母版', status: 'READY' },
        { key: 'conversation-phase', name: '开场、分享、服务、决策与修复阶段控制', status: 'READY' },
      ],
    };
  }
}
