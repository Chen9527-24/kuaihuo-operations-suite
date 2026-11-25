import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AppLayout from '@/layout/AppLayout.vue';
import { canAccessMenuPath, flatMenuItems } from './menu';
import { useAuthStore } from '@/stores/auth';

const viewMap = {
  '/dashboard': { name: 'DashboardView', component: () => import('@/views/DashboardView.vue'), keepAlive: true },
  '/robots/private-message': { name: 'PrivateMessageRobotManagementView', component: () => import('@/views/privatemessagerobotmanagement/index.vue'), keepAlive: true },
  '/robots/comment': { name: 'CommentRobotManagementView', component: () => import('@/views/commentrobotmanagement/index.vue'), keepAlive: true },
  '/robots/intercept': { name: 'InterceptRobotManagementView', component: () => import('@/views/interceptrobotmanagement/index.vue'), keepAlive: true },
  '/robots/dialogue-records': { name: 'DialogueRecordManagementView', component: () => import('@/views/dialoguerecordmanagement/index.vue'), keepAlive: true },
  '/robots/comment-records': { name: 'CommentRecordManagementView', component: () => import('@/views/commentrecordmanagement/index.vue'), keepAlive: true },
  '/customer-service/auto-reply': { name: 'CustomerServiceAutoReplyView', component: () => import('@/views/customer-service/auto-reply/index.vue'), keepAlive: true },
  '/customer-service/records': { name: 'CustomerServiceRecordsView', component: () => import('@/views/customer-service/records/index.vue'), keepAlive: true },
  '/customer-service/customer-profiles': { name: 'CustomerServiceCustomerProfilesView', component: () => import('@/views/customer-service/customer-profiles/index.vue'), keepAlive: true },
  '/customer-service/knowledge': { name: 'CustomerServiceKnowledgeView', component: () => import('@/views/customer-service/knowledge/index.vue'), keepAlive: true },
  '/customer-service/role-center': { name: 'CustomerServiceRoleCenterView', component: () => import('@/views/customer-service/role-center/index.vue'), keepAlive: true },
  '/customer-service/advanced': { name: 'CustomerServiceAdvancedView', component: () => import('@/views/customer-service/advanced/index.vue'), keepAlive: true },
  '/customer-service/ali-settings': { name: 'CustomerServiceAliSettingsView', component: () => import('@/views/customer-service/ali-settings/index.vue'), keepAlive: true },
  '/customer-service/context-profiles': { name: 'CustomerServiceContextProfilesView', component: () => import('@/views/customer-service/context-profiles/index.vue'), keepAlive: true },
  '/customer-service/intents': { name: 'CustomerServiceIntentsView', component: () => import('@/views/customer-service/intents/index.vue'), keepAlive: true },
  '/customer-service/overview': { name: 'CustomerServiceOverviewView', component: () => import('@/views/customer-service/overview/index.vue'), keepAlive: true },
  '/customer-service/assets': { name: 'CustomerServiceAssetsView', component: () => import('@/views/customer-service/assets/index.vue'), keepAlive: true },
  '/customer-service/roles': { name: 'CustomerServiceRolesView', component: () => import('@/views/customer-service/roles/index.vue'), keepAlive: true },
  '/customer-service/merchant-roles': { name: 'CustomerServiceMerchantRolesView', component: () => import('@/views/customer-service/merchant-roles/index.vue'), keepAlive: true },
  '/customer-service/industries': { name: 'CustomerServiceIndustriesView', component: () => import('@/views/customer-service/industries/index.vue'), keepAlive: true },
  '/customer-service/response-rules': { name: 'CustomerServiceResponseRulesView', component: () => import('@/views/customer-service/response-rules/index.vue'), keepAlive: true },
  '/customer-service/simulation': { name: 'CustomerServiceSimulationView', component: () => import('@/views/customer-service/simulation/index.vue'), keepAlive: true },
  '/media-accounts': { name: 'MediaAccountManagementView', component: () => import('@/views/mediaaccountmanagement/index.vue'), keepAlive: true },
  '/customer-leads': { name: 'CustomerLeadManagementView', component: () => import('@/views/customerleadmanagement/index.vue'), keepAlive: true },
  '/website/content': { name: 'WebsiteManagementView', component: () => import('@/views/websitemanagement/index.vue'), keepAlive: true },
  '/website/inquiries': { name: 'WebsiteInquiryManagementView', component: () => import('@/views/websiteinquirymanagement/index.vue'), keepAlive: true },
  '/tenants': { name: 'TenantManagementView', component: () => import('@/views/tenantmanagement/index.vue'), keepAlive: true },
  '/accounts': { name: 'AccountManagementView', component: () => import('@/views/accountmanagement/index.vue'), keepAlive: true },
  '/roles': { name: 'RoleManagementView', component: () => import('@/views/rolemanagement/index.vue'), keepAlive: true },
  '/permissions': { name: 'PermissionManagementView', component: () => import('@/views/permissionmanagement/index.vue'), keepAlive: true },
  '/dicts': { name: 'DictManagementView', component: () => import('@/views/dictmanagement/index.vue'), keepAlive: true },
  '/profile': { name: 'ProfileView', component: () => import('@/views/ProfileView.vue'), keepAlive: false }
} as const;

type ViewPath = keyof typeof viewMap;

export const keepAliveRouteNames = Object.values(viewMap).filter((item) => item.keepAlive).map((item) => item.name);

const children: RouteRecordRaw[] = flatMenuItems.map((item) => {
  const view = viewMap[item.path as ViewPath];
  return {
    path: item.path,
    name: view.name,
    component: view.component,
    meta: { title: item.title, icon: item.icon, closable: item.closable ?? item.path !== '/dashboard', keepAlive: view.keepAlive }
  };
});

const routes: RouteRecordRaw[] = [
  { path: '/', component: AppLayout, redirect: '/dashboard', meta: { requiresAuth: true }, children },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: '登录' } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
];

const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    // mode=add intentionally opens the login page without dropping the active
    // session, so another account can be added to the quick-switch list.
    if (auth.isLoggedIn && to.path === '/login' && to.query.mode !== 'add') return '/dashboard';
    return true;
  }

  if (!auth.isLoggedIn) {
    auth.setPostLoginRedirect(to.fullPath);
    return `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  }

  try {
    await auth.bootstrap();
  } catch {
    return '/login';
  }

  if (!canAccessMenuPath(to.path, auth.user.permissions, auth.isPlatformAdmin)) {
    return '/dashboard';
  }
  return true;
});

export default router;
