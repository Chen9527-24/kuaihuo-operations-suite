import type { MenuItem } from '@/types';

/**
 * 后台导航仅保留真实业务结构：三大目录 → 业务菜单。
 * `permissionCode` 是目录/菜单节点的授权编码；每日任务是唯一的默认入口，
 * 不依赖目录或菜单权限，但页面内部动作继续由按钮权限控制。
 */
export const menuItems: MenuItem[] = [
  {
    title: '运营业务',
    path: '/operation',
    icon: 'Grid',
    permissionCode: 'directory:operation',
    children: [
      { title: '每日任务', path: '/daily-tasks', icon: 'List', closable: false, alwaysVisible: true, permissionCode: 'menu:daily-tasks', permissionPrefixes: ['daily-task:'] },
      { title: '团长管理', path: '/distribution-groups', icon: 'Connection', permissionCode: 'menu:distribution-groups', permissionPrefixes: ['distribution-group:'] },
      { title: 'H5成员', path: '/app-users', icon: 'UserFilled', permissionCode: 'menu:app-users', permissionPrefixes: ['app-user:'] },
      { title: '商机客户', path: '/customer-leads', icon: 'OfficeBuilding', permissionCode: 'menu:customer-leads', permissionPrefixes: ['customer-lead:'] },
      { title: '提现管理', path: '/withdrawals', icon: 'Money', permissionCode: 'menu:withdrawals', permissionPrefixes: ['withdrawal:'] },
      { title: '多媒体账号', path: '/media-accounts', icon: 'VideoCamera', permissionCode: 'menu:media-accounts', permissionPrefixes: ['media-account:'] }
    ]
  },
  {
    title: '智能客服',
    path: '/customer-service',
    icon: 'MagicStick',
    permissionCode: 'directory:customer-service',
    children: [
      { title: '自动回复', path: '/customer-service/auto-reply', icon: 'ChatLineSquare', permissionCode: 'menu:private-message-robot', permissionPrefixes: ['robot:'] },
      { title: '竞品截流', path: '/robots/intercept', icon: 'Tickets', permissionCode: 'menu:intercept-robot', permissionPrefixes: ['robot:'] },
      { title: '回复记录', path: '/customer-service/records', icon: 'Collection', permissionCode: 'menu:private-message-robot', permissionPrefixes: ['robot:'] },
      { title: '账号配置', path: '/customer-service/customer-profiles', icon: 'Avatar', permissionCode: 'menu:customer-service-context-profiles', permissionPrefixes: ['customer-service:context-profile:'] },
      { title: '知识与流程', path: '/customer-service/knowledge', icon: 'DocumentChecked', permissionCode: 'menu:customer-service-context-profiles', permissionPrefixes: ['customer-service:context-profile:', 'customer-service:response-rule:', 'customer-service:asset:'] },
      { title: '角色配置', path: '/customer-service/role-center', icon: 'UserFilled', permissionCode: 'menu:customer-service-merchant-roles', permissionPrefixes: ['customer-service:role-module:', 'customer-service:merchant-role:', 'customer-service:role-prototype:', 'customer-service:industry-node:'] },
      { title: '测试与优化', path: '/customer-service/simulation', icon: 'Monitor', permissionCode: 'menu:customer-service-simulation', permissionPrefixes: ['customer-service:simulation:', 'customer-service:quality-rule:', 'customer-service:calibration:'] },

      // Keep existing bookmarks and permission checks working while the ordinary
      // navigation presents the smaller business-oriented information architecture.
      { title: '旧工作台', path: '/customer-service/overview', icon: 'Grid', hidden: true, permissionCode: 'menu:customer-service-overview', permissionPrefixes: ['customer-service:'] },
      { title: '旧高级管理', path: '/customer-service/advanced', icon: 'Setting', hidden: true, permissionCode: 'customer-service:foundation:initialize', permissionPrefixes: ['customer-service:role-module:', 'customer-service:merchant-role:', 'customer-service:industry-node:', 'customer-service:response-rule:'] },
      { title: '私信自动回复', path: '/robots/private-message', icon: 'User', hidden: true, permissionCode: 'menu:private-message-robot', permissionPrefixes: ['robot:'] },
      { title: '评论自动回复', path: '/robots/comment', icon: 'ChatLineSquare', hidden: true, permissionCode: 'menu:comment-robot', permissionPrefixes: ['robot:'] },
      { title: '对话记录', path: '/robots/dialogue-records', icon: 'Collection', hidden: true, permissionCode: 'menu:private-message-robot', permissionPrefixes: ['robot:'] },
      { title: '评论记录', path: '/robots/comment-records', icon: 'Document', hidden: true, permissionCode: 'menu:comment-robot', permissionPrefixes: ['robot:'] },
      { title: '默认角色设置', path: '/customer-service/ali-settings', icon: 'Avatar', hidden: true, permissionCode: 'menu:customer-service-merchant-roles', permissionPrefixes: ['customer-service:merchant-role:', 'customer-service:role-module:'] },
      { title: '账号知识与表达', path: '/customer-service/context-profiles', icon: 'Setting', hidden: true, permissionCode: 'menu:customer-service-context-profiles', permissionPrefixes: ['customer-service:context-profile:'] },
      { title: '客户意图与流程', path: '/customer-service/intents', icon: 'DocumentChecked', hidden: true, permissionCode: 'menu:customer-service-response-rules', permissionPrefixes: ['customer-service:response-rule:', 'customer-service:evaluation-case:'] },
      { title: '行业能力', path: '/customer-service/industries', icon: 'Collection', hidden: true, permissionCode: 'menu:customer-service-industries', permissionPrefixes: ['customer-service:industry-node:'] },
      { title: '配置资产', path: '/customer-service/assets', icon: 'Files', hidden: true, permissionCode: 'menu:customer-service-assets', permissionPrefixes: ['customer-service:asset:'] },
      { title: '角色原型', path: '/customer-service/roles', icon: 'UserFilled', hidden: true, permissionCode: 'menu:customer-service-roles', permissionPrefixes: ['customer-service:role-prototype:'] },
      { title: '客服角色', path: '/customer-service/merchant-roles', icon: 'Avatar', hidden: true, permissionCode: 'menu:customer-service-merchant-roles', permissionPrefixes: ['customer-service:merchant-role:', 'customer-service:role-module:'] },
      { title: '回复与流程', path: '/customer-service/response-rules', icon: 'DocumentChecked', hidden: true, permissionCode: 'menu:customer-service-response-rules', permissionPrefixes: ['customer-service:response-rule:'] }
    ]
  },
  {
    title: '官网管理',
    path: '/website',
    icon: 'Monitor',
    permissionCode: 'directory:website',
    children: [
      { title: '官网内容', path: '/website/content', icon: 'EditPen', permissionCode: 'menu:website-content', permissionPrefixes: ['website:config:', 'website:asset:'] },
      { title: '官网意向客户', path: '/website/inquiries', icon: 'UserFilled', permissionCode: 'menu:website-inquiries', permissionPrefixes: ['website-inquiry:'] }
    ]
  },
  {
    title: '系统管理',
    path: '/system',
    icon: 'Setting',
    permissionCode: 'directory:system',
    children: [
      { title: '租户管理', path: '/tenants', icon: 'OfficeBuilding', permissionCode: 'menu:tenants', permissionPrefixes: ['tenant:'] },
      { title: '账号管理', path: '/accounts', icon: 'User', permissionCode: 'menu:accounts', permissionPrefixes: ['user:read', 'user:create', 'user:update', 'user:delete'] },
      { title: '角色管理', path: '/roles', icon: 'UserFilled', permissionCode: 'menu:roles', permissionPrefixes: ['role:'] },
      { title: '权限管理', path: '/permissions', icon: 'Lock', permissionCode: 'menu:permissions', permissionPrefixes: ['permission:', 'rbac:'] },
      { title: '数据字典', path: '/dicts', icon: 'Collection', permissionCode: 'menu:dicts', permissionPrefixes: ['dict:'] },
      { title: '个人中心', path: '/profile', icon: 'Avatar', permissionCode: 'menu:profile', permissionPrefixes: ['user:profile:', 'file:mine:'] }
    ]
  }
];

export function getLeafMenuItems(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.children?.length ? getLeafMenuItems(item.children) : [item]));
}

/** 权限树选中菜单节点，或选中该菜单任一按钮，均视为可进入该菜单。 */
function hasPermissionForNode(item: MenuItem, permissions: string[], platformAdmin: boolean) {
  if (platformAdmin || item.alwaysVisible) return true;
  if (!item.permissionCode) return false;
  if (permissions.includes(item.permissionCode)) return true;
  if (item.permissionPrefixes?.length) {
    return permissions.some((code) => item.permissionPrefixes!.some((prefix) => code.startsWith(prefix)));
  }
  return false;
}

export function getAccessibleMenuItems(items: MenuItem[], permissions: string[], platformAdmin: boolean): MenuItem[] {
  return items
    .filter((item) => !item.hidden)
    .map((item) => {
      const children = item.children?.length ? getAccessibleMenuItems(item.children, permissions, platformAdmin) : undefined;
      if (children?.length) {
        return { ...item, children };
      }
      if (item.children?.length) return null;
      return hasPermissionForNode(item, permissions, platformAdmin) ? { ...item } : null;
    })
    .filter((item): item is MenuItem => Boolean(item));
}

export function getMenuPathChain(targetPath: string, items: MenuItem[] = menuItems): string[] {
  for (const item of items) {
    if (item.path === targetPath) return [item.path];
    if (item.children?.length) {
      const childPath = getMenuPathChain(targetPath, item.children);
      if (childPath.length) return [item.path, ...childPath];
    }
  }
  return [];
}

export function findMenuItemByPath(targetPath: string, items: MenuItem[] = menuItems): MenuItem | null {
  for (const item of items) {
    if (item.path === targetPath) return item;
    if (item.children?.length) {
      const child = findMenuItemByPath(targetPath, item.children);
      if (child) return child;
    }
  }
  return null;
}

export function canAccessMenuPath(path: string, permissions: string[], platformAdmin: boolean) {
  if (path === '/daily-tasks') return true;
  // 每日任务内的隐藏订单页只由“订单查看”按钮权限打开。
  if (path === '/task-orders') return platformAdmin || permissions.includes('daily-task:order:read');
  const item = findMenuItemByPath(path);
  return Boolean(item && hasPermissionForNode(item, permissions, platformAdmin));
}

export function isLeafMenuPath(targetPath: string): boolean {
  return flatMenuItems.some((item) => item.path === targetPath);
}

export const flatMenuItems = [
  ...getLeafMenuItems(menuItems),
  { title: '任务订单', path: '/task-orders', icon: 'Tickets', hidden: true, permissionCode: 'daily-task:order:read' }
];
