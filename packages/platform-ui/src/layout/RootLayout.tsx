import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@agyn/ui-new';
import {
  Bell,
  Bot,
  Boxes,
  ChevronDown,
  Database,
  GitBranch,
  KeyRound,
  MessageSquare,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useUser } from '../user/user.runtime';

const STORAGE_KEYS = {
  agentsOpen: 'ui.sidebar.section.agents.open',
  monitoringOpen: 'ui.sidebar.section.monitoring.open',
  memoryOpen: 'ui.sidebar.section.memory.open',
  settingsOpen: 'ui.sidebar.section.settings.open',
};

function useStoredBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const v = window.localStorage.getItem(key);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {
      /* ignore storage errors */
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, value ? 'true' : 'false');
    } catch {
      /* ignore storage errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  match?: (pathname: string) => boolean;
};

type Section = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  items: NavItem[];
};

function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) {
    return item.match(pathname);
  }
  if (item.exact) {
    return pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function RootLayout() {
  const [agentsOpen, setAgentsOpen] = useStoredBoolean(STORAGE_KEYS.agentsOpen, true);
  const [monitoringOpen, setMonitoringOpen] = useStoredBoolean(STORAGE_KEYS.monitoringOpen, false);
  const [memoryOpen, setMemoryOpen] = useStoredBoolean(STORAGE_KEYS.memoryOpen, true);
  const [settingsOpen, setSettingsOpen] = useStoredBoolean(STORAGE_KEYS.settingsOpen, false);

  const sections: Section[] = useMemo(
    () => [
      {
        id: 'agents',
        label: 'Agents',
        icon: Bot,
        isOpen: agentsOpen,
        setOpen: setAgentsOpen,
        items: [
          { label: 'Graph', to: '/agents/graph', icon: GitBranch, exact: true },
          {
            label: 'Threads',
            to: '/agents/threads',
            icon: MessageSquare,
            match: (pathname) => pathname.startsWith('/agents/threads'),
          },
          { label: 'Reminders', to: '/agents/reminders', icon: Bell },
        ],
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        icon: Boxes,
        isOpen: monitoringOpen,
        setOpen: setMonitoringOpen,
        items: [{ label: 'Containers', to: '/monitoring/containers', icon: Boxes }],
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: Database,
        isOpen: memoryOpen,
        setOpen: setMemoryOpen,
        items: [{ label: 'Explorer', to: '/memory', icon: Database }],
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        isOpen: settingsOpen,
        setOpen: setSettingsOpen,
        items: [
          { label: 'Secrets', to: '/settings/secrets', icon: KeyRound },
          { label: 'Variables', to: '/settings/variables', icon: KeyRound },
        ],
      },
    ],
    [agentsOpen, monitoringOpen, memoryOpen, settingsOpen, setAgentsOpen, setMonitoringOpen, setMemoryOpen, setSettingsOpen],
  );

  const { user } = useUser();
  const location = useLocation();

  return (
    <SidebarProvider className="bg-background">
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-wide group-data-[collapsible=icon]:hidden">
                  Hautech Agents
                </span>
                <span className="hidden text-xs font-semibold uppercase tracking-wider group-data-[collapsible=icon]:inline">
                  HA
                </span>
              </div>
              <SidebarTrigger className="hidden md:flex" aria-label="Toggle sidebar" />
            </div>
          </SidebarHeader>

          <SidebarContent>
            {sections.map((section) => (
              <SidebarGroup key={section.id}>
                <Collapsible open={section.isOpen} onOpenChange={section.setOpen}>
                  <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/80">
                      <section.icon className="h-4 w-4" />
                      <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">{section.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform data-[state=open]:rotate-180 group-data-[collapsible=icon]:hidden" />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {section.items.map((item) => (
                          <NavSidebarItem
                            key={item.to}
                            item={item}
                            isActive={isNavItemActive(item, location.pathname)}
                          />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <div className="flex items-center gap-3 rounded-md px-2 py-2">
              <Avatar className="h-9 w-9">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user?.name || 'User'} /> : null}
                <AvatarFallback>{(user?.name || 'G').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-medium">{user?.name || 'Guest'}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email || 'guest@example.com'}</div>
              </div>
            </div>
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <header className="flex items-center gap-2 border-b px-3 py-4 md:hidden">
            <SidebarTrigger aria-label="Open navigation" />
            <Separator orientation="vertical" className="h-6" />
            <span className="text-base font-semibold tracking-wide">Hautech Agents</span>
          </header>
          <div className="relative flex-1 min-w-0">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function NavSidebarItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.label}
        onClick={() => {
          if (isMobile) {
            setOpenMobile(false);
          }
        }}
      >
        <NavLink to={item.to} end={item.exact} className="flex w-full items-center gap-2">
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
