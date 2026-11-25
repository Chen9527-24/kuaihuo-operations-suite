import { PrismaClient } from '@prisma/client';

type PermissionSeed = {
  code: string;
  name: string;
  group: string;
  type: 'DIRECTORY' | 'MENU' | 'BUTTON';
  parentCode?: string;
  routePath?: string;
  component?: string;
  icon?: string;
  sort: number;
};

/**
 * 后台权限唯一基线：三个顶级目录 → 菜单 → 按钮。
 * 目录/菜单是授权树与前端导航结构；真正的接口拦截仍以按钮编码为准。
 */
export const permissionSeeds: PermissionSeed[] = [
  // 顶级目录
  { code: 'directory:operation', name: '运营业务', group: 'operation', type: 'DIRECTORY', icon: 'Grid', sort: 10 },
  { code: 'directory:robot', name: '机器人管理', group: 'robot', type: 'DIRECTORY', icon: 'ChatLineSquare', sort: 20 },
  { code: 'directory:customer-service', name: '智能客服', group: 'customer-service', type: 'DIRECTORY', icon: 'MagicStick', sort: 30 },
  { code: 'directory:website', name: '官网管理', group: 'website', type: 'DIRECTORY', icon: 'Monitor', sort: 40 },
  { code: 'directory:system', name: '系统管理', group: 'system', type: 'DIRECTORY', icon: 'Setting', sort: 50 },

  // 运营业务菜单
  { code: 'menu:customer-leads', name: '商机客户', group: 'customer-lead', type: 'MENU', parentCode: 'directory:operation', routePath: '/customer-leads', component: 'CustomerLeadManagementView', icon: 'OfficeBuilding', sort: 40 },
  { code: 'menu:media-accounts', name: '多媒体账号', group: 'media-account', type: 'MENU', parentCode: 'directory:operation', routePath: '/media-accounts', component: 'MediaAccountManagementView', icon: 'VideoCamera', sort: 60 },

  // 机器人管理菜单。当前后端机器人接口仍共享 robot:* 按钮编码，菜单节点用于导航与角色树分组。
  { code: 'menu:private-message-robot', name: '私信机器人', group: 'robot', type: 'MENU', parentCode: 'directory:robot', routePath: '/robots/private-message', component: 'PrivateMessageRobotManagementView', icon: 'User', sort: 10 },
  { code: 'menu:comment-robot', name: '评论机器人', group: 'robot', type: 'MENU', parentCode: 'directory:robot', routePath: '/robots/comment', component: 'CommentRobotManagementView', icon: 'ChatLineSquare', sort: 20 },
  { code: 'menu:intercept-robot', name: '截流机器人', group: 'robot', type: 'MENU', parentCode: 'directory:robot', routePath: '/robots/intercept', component: 'InterceptRobotManagementView', icon: 'Tickets', sort: 30 },

  // 智能客服菜单。V5 与旧行业 AI 页面、接口和权限域完全隔离。
  { code: 'menu:customer-service-overview', name: '工作台', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/overview', component: 'CustomerServiceOverviewView', icon: 'Grid', sort: 10 },
  { code: 'menu:customer-service-assets', name: '配置资产', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/assets', component: 'CustomerServiceAssetsView', icon: 'Files', sort: 20 },
  { code: 'menu:customer-service-roles', name: '角色原型', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/roles', component: 'CustomerServiceRolesView', icon: 'UserFilled', sort: 30 },
  { code: 'menu:customer-service-merchant-roles', name: '客服角色', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/merchant-roles', component: 'CustomerServiceMerchantRolesView', icon: 'Avatar', sort: 40 },
  { code: 'menu:customer-service-industries', name: '行业能力', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/industries', component: 'CustomerServiceIndustriesView', icon: 'Collection', sort: 50 },
  { code: 'menu:customer-service-response-rules', name: '回复与流程', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/response-rules', component: 'CustomerServiceResponseRulesView', icon: 'DocumentChecked', sort: 60 },
  { code: 'menu:customer-service-context-profiles', name: '背景与规则', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/context-profiles', component: 'CustomerServiceContextProfilesView', icon: 'Setting', sort: 65 },
  { code: 'menu:customer-service-simulation', name: '回复调优', group: 'customer-service', type: 'MENU', parentCode: 'directory:customer-service', routePath: '/customer-service/simulation', component: 'CustomerServiceSimulationView', icon: 'Monitor', sort: 70 },

  // 官网管理（平台级全局配置，不向普通租户角色默认授权）
  { code: 'menu:website-content', name: '官网内容', group: 'website', type: 'MENU', parentCode: 'directory:website', routePath: '/website/content', component: 'WebsiteManagementView', icon: 'EditPen', sort: 10 },
  { code: 'menu:website-inquiries', name: '官网意向客户', group: 'website-inquiry', type: 'MENU', parentCode: 'directory:website', routePath: '/website/inquiries', component: 'WebsiteInquiryManagementView', icon: 'UserFilled', sort: 20 },

  // 系统管理菜单
  { code: 'menu:tenants', name: '租户管理', group: 'tenant', type: 'MENU', parentCode: 'directory:system', routePath: '/tenants', component: 'TenantManagementView', icon: 'OfficeBuilding', sort: 10 },
  { code: 'menu:accounts', name: '账号管理', group: 'user', type: 'MENU', parentCode: 'directory:system', routePath: '/accounts', component: 'AccountManagementView', icon: 'User', sort: 20 },
  { code: 'menu:roles', name: '角色管理', group: 'role', type: 'MENU', parentCode: 'directory:system', routePath: '/roles', component: 'RoleManagementView', icon: 'UserFilled', sort: 30 },
  { code: 'menu:permissions', name: '权限管理', group: 'permission', type: 'MENU', parentCode: 'directory:system', routePath: '/permissions', component: 'PermissionManagementView', icon: 'Lock', sort: 40 },
  { code: 'menu:dicts', name: '数据字典', group: 'dict', type: 'MENU', parentCode: 'directory:system', routePath: '/dicts', component: 'DictManagementView', icon: 'Collection', sort: 50 },
  { code: 'menu:profile', name: '个人中心', group: 'user', type: 'MENU', parentCode: 'directory:system', routePath: '/profile', component: 'ProfileView', icon: 'Avatar', sort: 60 },

  // 商机客户
  { code: 'customer-lead:read', name: '查看商机客户', group: 'customer-lead', type: 'BUTTON', parentCode: 'menu:customer-leads', sort: 10 },
  { code: 'customer-lead:create', name: '新增商机客户', group: 'customer-lead', type: 'BUTTON', parentCode: 'menu:customer-leads', sort: 20 },
  { code: 'customer-lead:update', name: '编辑商机客户', group: 'customer-lead', type: 'BUTTON', parentCode: 'menu:customer-leads', sort: 30 },
  { code: 'customer-lead:follow-up:create', name: '登记商机跟进', group: 'customer-lead', type: 'BUTTON', parentCode: 'menu:customer-leads', sort: 40 },
  { code: 'customer-lead:delete', name: '删除商机客户', group: 'customer-lead', type: 'BUTTON', parentCode: 'menu:customer-leads', sort: 50 },
  { code: 'customer-lead:website-submission:update', name: '确认查看官网咨询', group: 'customer-lead', type: 'BUTTON', parentCode: 'menu:customer-leads', sort: 60 },

  // 官网内容采用草稿与发布分权，资源上传仅服务官网配置页面。
  { code: 'website:config:read', name: '查看官网配置', group: 'website', type: 'BUTTON', parentCode: 'menu:website-content', sort: 10 },
  { code: 'website:config:update', name: '编辑官网草稿', group: 'website', type: 'BUTTON', parentCode: 'menu:website-content', sort: 20 },
  { code: 'website:config:publish', name: '发布官网配置', group: 'website', type: 'BUTTON', parentCode: 'menu:website-content', sort: 30 },
  { code: 'website:asset:upload', name: '上传官网素材', group: 'website', type: 'BUTTON', parentCode: 'menu:website-content', sort: 40 },

  // 官网意向客户与通用商机权限隔离；所有接口均在服务端强制限定为官网表单提交记录。
  { code: 'website-inquiry:read', name: '查看官网意向客户', group: 'website-inquiry', type: 'BUTTON', parentCode: 'menu:website-inquiries', sort: 10 },
  { code: 'website-inquiry:viewed:update', name: '确认查看官网咨询', group: 'website-inquiry', type: 'BUTTON', parentCode: 'menu:website-inquiries', sort: 20 },
  { code: 'website-inquiry:follow-up:create', name: '登记官网客户跟进', group: 'website-inquiry', type: 'BUTTON', parentCode: 'menu:website-inquiries', sort: 30 },
  { code: 'website-inquiry:delete', name: '移入官网客户回收站', group: 'website-inquiry', type: 'BUTTON', parentCode: 'menu:website-inquiries', sort: 40 },
  { code: 'website-inquiry:restore', name: '恢复官网意向客户', group: 'website-inquiry', type: 'BUTTON', parentCode: 'menu:website-inquiries', sort: 50 },
  { code: 'website-inquiry:purge', name: '彻底删除官网意向客户', group: 'website-inquiry', type: 'BUTTON', parentCode: 'menu:website-inquiries', sort: 60 },

  // 多媒体账号
  { code: 'media-account:read', name: '查看多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 10 },
  { code: 'media-account:create', name: '新增多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 20 },
  { code: 'media-account:update', name: '编辑多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 30 },
  { code: 'media-account:delete', name: '删除多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 40 },

  // 机器人共享按钮。当前后端机器人 API 尚以 robot:* 作为统一权限，不伪造未接入的子模块按钮。
  { code: 'robot:read', name: '查看机器人数据', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 10 },
  { code: 'robot:create', name: '新增机器人配置', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 20 },
  { code: 'robot:update', name: '编辑机器人配置', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 30 },
  { code: 'robot:delete', name: '删除机器人配置', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 40 },
  { code: 'robot:start', name: '启动机器人', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 50 },
  { code: 'robot:stop', name: '停止机器人', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 60 },
  { code: 'robot:device:read', name: '查看机器人设备', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 70 },
  { code: 'robot:device:create', name: '新增机器人设备', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 80 },
  { code: 'robot:device:update', name: '编辑机器人设备', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 90 },
  { code: 'robot:device:delete', name: '删除机器人设备', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 100 },
  { code: 'robot:auth:read', name: '查看机器人授权', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 110 },
  { code: 'robot:auth:create', name: '新增机器人授权', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 120 },
  { code: 'robot:auth:update', name: '编辑机器人授权', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 130 },
  { code: 'robot:auth:delete', name: '删除机器人授权', group: 'robot', type: 'BUTTON', parentCode: 'menu:private-message-robot', sort: 140 },

  // 智能客服 V5 独立权限域。保留 customer-service:read 兼容第一版工作台。
  { code: 'customer-service:read', name: '查看智能客服工作台', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-overview', sort: 10 },
  { code: 'customer-service:foundation:read', name: '查看正式初始化状态', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-overview', sort: 20 },
  { code: 'customer-service:foundation:initialize', name: '执行正式初始化', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-overview', sort: 30 },
  { code: 'customer-service:asset:read', name: '查看配置资产', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-assets', sort: 10 },
  { code: 'customer-service:asset:create', name: '新增配置资产', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-assets', sort: 20 },
  { code: 'customer-service:asset:update', name: '编辑配置资产', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-assets', sort: 30 },
  { code: 'customer-service:asset:version:create', name: '新增资产版本', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-assets', sort: 40 },
  { code: 'customer-service:asset:publish', name: '发布资产版本', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-assets', sort: 50 },
  { code: 'customer-service:role-prototype:read', name: '查看角色原型', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-roles', sort: 10 },
  { code: 'customer-service:role-prototype:create', name: '新增角色原型', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-roles', sort: 20 },
  { code: 'customer-service:role-prototype:update', name: '编辑角色原型', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-roles', sort: 30 },
  { code: 'customer-service:role-prototype:delete', name: '删除角色原型', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-roles', sort: 40 },
  { code: 'customer-service:merchant-role:read', name: '查看客服角色', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 10 },
  { code: 'customer-service:merchant-role:create', name: '新增客服角色', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 20 },
  { code: 'customer-service:merchant-role:update', name: '编辑客服角色', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 30 },
  { code: 'customer-service:merchant-role:delete', name: '删除客服角色', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 40 },
  { code: 'customer-service:role-module:read', name: '查看角色模块', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 50 },
  { code: 'customer-service:role-module:create', name: '新增角色模块', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 60 },
  { code: 'customer-service:role-module:update', name: '编辑角色模块', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-merchant-roles', sort: 70 },
  { code: 'customer-service:industry-node:read', name: '查看行业能力', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-industries', sort: 10 },
  { code: 'customer-service:industry-node:create', name: '新增行业节点', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-industries', sort: 20 },
  { code: 'customer-service:industry-node:update', name: '编辑行业节点', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-industries', sort: 30 },
  { code: 'customer-service:industry-node:delete', name: '删除行业节点', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-industries', sort: 40 },
  { code: 'customer-service:response-rule:read', name: '查看回复规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-response-rules', sort: 10 },
  { code: 'customer-service:response-rule:create', name: '新增回复规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-response-rules', sort: 20 },
  { code: 'customer-service:response-rule:update', name: '编辑回复规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-response-rules', sort: 30 },
  { code: 'customer-service:context-profile:read', name: '查看背景与语言规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-context-profiles', sort: 10 },
  { code: 'customer-service:context-profile:create', name: '新增背景与语言规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-context-profiles', sort: 20 },
  { code: 'customer-service:context-profile:update', name: '编辑背景与语言规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-context-profiles', sort: 30 },
  { code: 'customer-service:simulation:compile', name: '分析回复规则与运行约束', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 10 },
  { code: 'customer-service:simulation:execute', name: '生成候选回复并质检', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 20 },
  { code: 'customer-service:evaluation-case:read', name: '查看正式测试案例', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 30 },
  { code: 'customer-service:quality-rule:read', name: '查看质量规则', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 40 },
  { code: 'customer-service:calibration:read', name: '查看校准记录', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 50 },
  { code: 'customer-service:calibration:create', name: '标记不满意回复', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 60 },
  { code: 'customer-service:calibration:analyze', name: '执行 AI 校准分析', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 70 },
  { code: 'customer-service:calibration:update', name: '更新校准状态', group: 'customer-service', type: 'BUTTON', parentCode: 'menu:customer-service-simulation', sort: 80 },

  // 系统管理
  { code: 'tenant:read', name: '查看租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 10 },
  { code: 'tenant:create', name: '新增租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 20 },
  { code: 'tenant:update', name: '编辑租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 30 },
  { code: 'tenant:delete', name: '删除租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 40 },
  { code: 'user:read', name: '查看账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 10 },
  { code: 'user:create', name: '新增账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 20 },
  { code: 'user:update', name: '编辑账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 30 },
  { code: 'user:delete', name: '删除账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 40 },
  { code: 'role:read', name: '查看角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 10 },
  { code: 'role:create', name: '新增角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 20 },
  { code: 'role:update', name: '编辑角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 30 },
  { code: 'role:delete', name: '删除角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 40 },
  { code: 'permission:read', name: '查看权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 10 },
  { code: 'permission:create', name: '新增权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 20 },
  { code: 'permission:update', name: '编辑权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 30 },
  { code: 'permission:delete', name: '删除权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 40 },
  { code: 'rbac:read', name: '查看RBAC概览', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 50 },
  { code: 'dict:read', name: '查看数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 10 },
  { code: 'dict:create', name: '新增数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 20 },
  { code: 'dict:update', name: '编辑数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 30 },
  { code: 'dict:delete', name: '删除数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 40 },
  { code: 'user:profile:read', name: '查看个人资料', group: 'user', type: 'BUTTON', parentCode: 'menu:profile', sort: 10 },
  { code: 'user:profile:update', name: '编辑个人资料', group: 'user', type: 'BUTTON', parentCode: 'menu:profile', sort: 20 },
  { code: 'file:upload', name: '上传文件', group: 'file', type: 'BUTTON', parentCode: 'menu:profile', sort: 35 },
  { code: 'file:mine:read', name: '查看我的文件', group: 'file', type: 'BUTTON', parentCode: 'menu:profile', sort: 30 },
];

// 已废弃的旧测试批次/强制清理入口保留数据库历史，但不再出现在日常权限树。
const retiredPermissionCodes = [
  'daily-task:test-data:reset',
  'test-data-batch:read',
  'test-data-batch:create',
  'test-data-batch:update',
  'test-data-batch:purge',
  'sms:send',
  'operation-log:read',
  'menu:industry-ai-robot',
  'industry-ai:read',
  'industry-ai:create',
  'industry-ai:update',
  'industry-ai:delete',
  'industry-ai:publish',
  'industry-ai:test',
] as const;

type DictSeed = Array<{ code: string; name: string; items: Array<{ label: string; value: string; color?: string; sort: number }> }>;

export const dictSeed: DictSeed = [
  {
    code: 'enabled_status',
    name: '启用状态',
    items: [
      { label: '启用', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'tenant_status',
    name: '租户状态',
    items: [
      { label: '激活', value: 'ACTIVE', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
      { label: '已过期', value: 'EXPIRED', color: 'orange', sort: 3 },
    ],
  },
  {
    code: 'user_status',
    name: '用户状态',
    items: [
      { label: '启用', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'role_status',
    name: '角色状态',
    items: [
      { label: '启用', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'permission_type',
    name: '权限类型',
    items: [
      { label: '目录', value: 'DIRECTORY', sort: 1 },
      { label: '菜单', value: 'MENU', sort: 2 },
      { label: '按钮', value: 'BUTTON', sort: 3 },
    ],
  },
  {
    code: 'permission_validation_status',
    name: '权限校验状态',
    items: [
      { label: '开启', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '关闭', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'media_platform',
    name: '多媒体平台',
    items: [
      { label: '抖音', value: 'DOUYIN', sort: 1 },
      { label: '微信视频号', value: 'WECHAT_VIDEO', sort: 2 },
      { label: '小红书', value: 'XIAOHONGSHU', sort: 3 },
    ],
  },
  {
    code: 'robot_type',
    name: '机器人类型',
    items: [
      { label: '私信自动回复机器人', value: 'PRIVATE_MESSAGE', color: 'blue', sort: 1 },
      { label: '评论机器人', value: 'COMMENT_REPLY', color: 'green', sort: 2 },
      { label: '截流机器人', value: 'INTERCEPT', color: 'orange', sort: 3 },
      { label: '主动私信机器人', value: 'LEAD_PRIVATE_MESSAGE', color: 'purple', sort: 4 },
    ],
  },
  {
    code: 'robot_status',
    name: '机器人状态',
    items: [
      { label: '草稿', value: 'DRAFT', color: 'gray', sort: 1 },
      { label: '就绪', value: 'READY', color: 'blue', sort: 2 },
      { label: '运行中', value: 'RUNNING', color: 'green', sort: 3 },
      { label: '停止中', value: 'STOPPING', color: 'orange', sort: 4 },
      { label: '已停止', value: 'STOPPED', color: 'gray', sort: 5 },
      { label: '已过期', value: 'EXPIRED', color: 'red', sort: 6 },
      { label: '异常', value: 'ERROR', color: 'red', sort: 7 },
      { label: '已禁用', value: 'DISABLED', color: 'red', sort: 8 },
    ],
  },
  {
    code: 'robot_auth_status',
    name: '机器人授权状态',
    items: [
      { label: '未绑定', value: 'UNBOUND', color: 'gray', sort: 1 },
      { label: '待扫码', value: 'WAIT_QR', color: 'blue', sort: 2 },
      { label: '扫码中', value: 'SCANNING', color: 'orange', sort: 3 },
      { label: '已授权', value: 'AUTHORIZED', color: 'green', sort: 4 },
      { label: '授权过期', value: 'AUTH_EXPIRED', color: 'red', sort: 5 },
      { label: '已撤销', value: 'REVOKED', color: 'red', sort: 6 },
      { label: '授权失败', value: 'AUTH_FAILED', color: 'red', sort: 7 },
    ],
  },
  {
    code: 'robot_device_status',
    name: '机器人设备状态',
    items: [
      { label: '离线', value: 'OFFLINE', color: 'gray', sort: 1 },
      { label: '在线', value: 'ONLINE', color: 'green', sort: 2 },
      { label: '忙碌', value: 'BUSY', color: 'orange', sort: 3 },
      { label: '已禁用', value: 'DISABLED', color: 'red', sort: 4 },
    ],
  },
  {
    code: 'robot_run_status',
    name: '机器人运行状态',
    items: [
      { label: '运行中', value: 'RUNNING', color: 'green', sort: 1 },
      { label: '已停止', value: 'STOPPED', color: 'gray', sort: 2 },
      { label: '已过期', value: 'EXPIRED', color: 'red', sort: 3 },
      { label: '失败', value: 'FAILED', color: 'red', sort: 4 },
    ],
  },
  {
    code: 'robot_stop_reason',
    name: '机器人停止原因',
    items: [
      { label: '手动停止', value: 'MANUAL', color: 'gray', sort: 1 },
      { label: '已过期', value: 'EXPIRED', color: 'red', sort: 2 },
      { label: '授权失效', value: 'AUTH_LOST', color: 'red', sort: 3 },
      { label: '设备离线', value: 'DEVICE_OFFLINE', color: 'orange', sort: 4 },
      { label: '平台限制', value: 'PLATFORM_LIMIT', color: 'orange', sort: 5 },
      { label: '系统异常', value: 'SYSTEM_ERROR', color: 'red', sort: 6 },
    ],
  },
  {
    code: 'file_scene',
    name: '文件场景',
    items: [
      { label: '用户头像', value: 'USER_AVATAR', sort: 1 },
      { label: '租户附件', value: 'TENANT_ATTACHMENT', sort: 3 },
    ],
  },
];

export const customerServiceRoleModuleDefinitionSeeds = [
  { code: 'IDENTITY', name: '身份定义', description: '角色公开身份、职责边界和品牌关系。', defaultMergeMode: 'OVERRIDE', defaultPriority: 1000, sort: 10 },
  { code: 'PERSONALITY', name: '核心人格', description: '稳定性格、判断方式、责任感和克制边界。', defaultMergeMode: 'APPEND', defaultPriority: 900, sort: 20 },
  { code: 'LANGUAGE_STYLE', name: '语言风格', description: '表达节奏、用词、正式度和禁止表达。', defaultMergeMode: 'APPEND', defaultPriority: 800, sort: 30 },
  { code: 'SERVICE_POSTURE', name: '服务姿态', description: '温度、直接度、主动性、责任承担和销售显露度。', defaultMergeMode: 'STRICTER', defaultPriority: 850, sort: 40 },
  { code: 'EMOTION_RESPONSE', name: '情绪回应', description: '客户情绪识别后的承接方式和克制规则。', defaultMergeMode: 'APPEND', defaultPriority: 750, sort: 50 },
  { code: 'CASUAL_CHAT', name: '普通聊天', description: '问候、闲聊、生活分享和结束话题的行为边界。', defaultMergeMode: 'APPEND', defaultPriority: 400, sort: 60 },
  { code: 'BUSINESS_BEHAVIOR', name: '经营行为', description: '服务目标、经营目标、推荐强度和停止销售条件。', defaultMergeMode: 'STRICTER', defaultPriority: 700, sort: 70 },
  { code: 'CONFLICT_HANDLING', name: '冲突处理', description: '投诉、拒绝、关系修复和人工接管策略。', defaultMergeMode: 'STRICTER', defaultPriority: 950, sort: 80 },
  { code: 'PROHIBITION', name: '禁止事项', description: '禁止声明、禁止动作和安全红线。', defaultMergeMode: 'STRICTER', defaultPriority: 1100, sort: 90 },
  { code: 'CASE_REFERENCE', name: '案例参考', description: '可解释的决策或表达参考，不作为确定性事实。', defaultMergeMode: 'APPEND', defaultPriority: 300, sort: 100 },
  { code: 'EVALUATION_CRITERIA', name: '评测标准', description: '生成结果必须满足的质量标准。', defaultMergeMode: 'STRICTER', defaultPriority: 1000, sort: 110 },
  { code: 'CUSTOM_CONSTRAINT', name: '自定义约束', description: '商家在平台注册范围内增加的补充约束。', defaultMergeMode: 'APPEND', defaultPriority: 600, sort: 120 },
] as const;

export async function syncCustomerServiceRoleModuleDefinitions(prisma: PrismaClient) {
  for (const item of customerServiceRoleModuleDefinitionSeeds) {
    await prisma.customerServiceRoleModuleDefinition.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
        defaultMergeMode: item.defaultMergeMode,
        defaultPriority: item.defaultPriority,
        status: 'ENABLED',
        sort: item.sort,
      },
      create: {
        code: item.code,
        name: item.name,
        description: item.description,
        defaultMergeMode: item.defaultMergeMode,
        defaultPriority: item.defaultPriority,
        status: 'ENABLED',
        sort: item.sort,
      },
    });
  }
}

export async function syncSystemDicts(prisma: PrismaClient) {
  for (const type of dictSeed) {
    await prisma.dictType.upsert({
      where: { code: type.code },
      update: { name: type.name, status: 'ENABLED' },
      create: { code: type.code, name: type.name, status: 'ENABLED' },
    });

    for (const item of type.items) {
      await prisma.dictItem.upsert({
        where: { typeCode_value: { typeCode: type.code, value: item.value } },
        update: { label: item.label, color: item.color ?? null, sort: item.sort, status: 'ENABLED' },
        create: { typeCode: type.code, label: item.label, value: item.value, color: item.color ?? null, sort: item.sort, status: 'ENABLED' },
      });
    }
  }
}

export async function syncSystemAccessControl(prisma: PrismaClient) {
  const permissionMap = new Map<string, { id: string }>();

  // 必须按目录 → 菜单 → 按钮顺序 upsert，才能在同一次同步中安全绑定 parentId。
  for (const permission of permissionSeeds) {
    const parentId = permission.parentCode ? permissionMap.get(permission.parentCode)?.id : null;
    if (permission.parentCode && !parentId) {
      throw new Error(`权限父节点不存在：${permission.parentCode}`);
    }

    const saved = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        parentId,
        name: permission.name,
        group: permission.group,
        type: permission.type,
        status: 'ENABLED',
        sort: permission.sort,
        routePath: permission.routePath ?? null,
        component: permission.component ?? null,
        icon: permission.icon ?? null,
      },
      create: {
        parentId,
        code: permission.code,
        name: permission.name,
        group: permission.group,
        type: permission.type,
        status: 'ENABLED',
        sort: permission.sort,
        routePath: permission.routePath ?? null,
        component: permission.component ?? null,
        icon: permission.icon ?? null,
      },
      select: { id: true },
    });
    permissionMap.set(permission.code, saved);
  }

  // 历史测试批次权限不删除，避免破坏历史角色关联；仅退役并从日常授权树隐藏。
  await prisma.permission.updateMany({
    where: { code: { in: [...retiredPermissionCodes] } },
    data: { status: 'DISABLED', parentId: null },
  });

  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    update: { name: '超级管理员', scope: 'PLATFORM', status: 'ENABLED' },
    create: { code: 'admin', name: '超级管理员', scope: 'PLATFORM', status: 'ENABLED' },
  });

  const tenantAdminRole = await prisma.role.upsert({
    where: { code: 'tenant_admin' },
    update: { name: '租户管理员', scope: 'TENANT', status: 'ENABLED' },
    create: { code: 'tenant_admin', name: '租户管理员', scope: 'TENANT', status: 'ENABLED' },
  });

  const tenantUserRole = await prisma.role.upsert({
    where: { code: 'tenant_user' },
    update: { name: '租户使用人', scope: 'TENANT', status: 'ENABLED' },
    create: { code: 'tenant_user', name: '租户使用人', scope: 'TENANT', status: 'ENABLED' },
  });

  const allPermissionCodes = permissionSeeds.map((item) => item.code);
  const tenantPermissionCodes = allPermissionCodes.filter((code) =>
    [
      'directory:operation',
      'directory:robot',
      'directory:customer-service',
      'directory:system',
      'menu:customer-leads',
      'menu:media-accounts',
      'menu:private-message-robot',
      'menu:comment-robot',
      'menu:intercept-robot',
      'menu:customer-service-overview',
      'menu:customer-service-assets',
      'menu:customer-service-roles',
      'menu:customer-service-merchant-roles',
      'menu:customer-service-industries',
      'menu:customer-service-response-rules',
      'menu:customer-service-context-profiles',
      'menu:customer-service-simulation',
      'menu:profile',
      'user:profile',
      'file:',
      'media-account:',
      'customer-lead:',
      'robot:',
      'customer-service:',
    ].some((prefix) => code.startsWith(prefix)),
  );

  await assignRolePermissions(prisma, adminRole.id, allPermissionCodes.map((code) => permissionMap.get(code)!.id));
  await assignRolePermissions(prisma, tenantAdminRole.id, tenantPermissionCodes.map((code) => permissionMap.get(code)!.id));
  await assignRolePermissions(
    prisma,
    tenantUserRole.id,
    tenantPermissionCodes
      .filter((code) => !code.endsWith(':delete'))
      .map((code) => permissionMap.get(code)!.id),
  );

  return { adminRole, tenantAdminRole, tenantUserRole };
}

export async function ensureSeedAdminRoleBinding(prisma: PrismaClient) {
  const username = (process.env.SEED_ADMIN_USERNAME ?? 'admin').trim();
  if (!username) {
    return { username: '', bound: false, reason: 'missing_username' as const };
  }

  const [user, adminRole] = await Promise.all([
    prisma.user.findUnique({
      where: { username },
      select: { id: true, status: true, deletedAt: true },
    }),
    prisma.role.findUnique({
      where: { code: 'admin' },
      select: { id: true },
    }),
  ]);

  if (!user || user.deletedAt || !adminRole) {
    return {
      username,
      bound: false,
      reason: !user ? ('user_not_found' as const) : !adminRole ? ('role_not_found' as const) : ('user_deleted' as const),
    };
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  if (user.status !== 'ENABLED') {
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ENABLED' },
    });
  }

  return { username, bound: true, reason: 'ok' as const };
}

async function assignRolePermissions(prisma: PrismaClient, roleId: string, permissionIds: string[]) {
  await Promise.all(
    permissionIds.map((permissionId) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      }),
    ),
  );
}
