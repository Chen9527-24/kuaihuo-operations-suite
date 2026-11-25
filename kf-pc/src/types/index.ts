export interface MenuItem {
  title: string;
  path: string;
  icon: string;
  closable?: boolean;
  hidden?: boolean;
  /** 对应目录/菜单权限编码，仅用于前端导航可见性。 */
  permissionCode?: string;
  /** 该菜单对应的按钮权限前缀；兼容旧角色只勾选按钮、未显式勾选菜单节点的情况。 */
  permissionPrefixes?: string[];
  /** 登录后所有后台账号均可进入的页面。 */
  alwaysVisible?: boolean;
  children?: MenuItem[];
}

export interface TabItem {
  title: string;
  path: string;
  name: string;
  closable: boolean;
}
