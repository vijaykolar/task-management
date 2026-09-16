import {
  BellIcon,
  CheckSquareIcon,
  FolderKanbanIcon,
  LayoutGridIcon,
  PlusIcon,
  UserCogIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

import { HealthIndicator } from "@/components/layout/health-indicator";
import { NavUser } from "@/components/layout/nav-user";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useProjects } from "@/features/projects/hooks";
import { projectColor } from "@/lib/project-color";
import { cn } from "@/lib/utils";
import type { User } from "@/types/models";

const mainNav = [
  { label: "Projects", to: "/", icon: LayoutGridIcon, end: true },
  { label: "My work", to: "/my-work", icon: CheckSquareIcon, end: false },
  { label: "Notifications", to: "/notifications", icon: BellIcon, end: false },
  { label: "Account", to: "/account", icon: UserCogIcon, end: false },
];

const SIDEBAR_PROJECT_LIMIT = 8;

export function AppSidebar({ user }: { user: User }) {
  const { pathname } = useLocation();
  const projects = useProjects({ limit: SIDEBAR_PROJECT_LIMIT });
  const total = projects.data?.pagination.total ?? 0;
  const [createOpen, setCreateOpen] = useState(false);

  const isActive = (to: string, end: boolean) =>
    end ? pathname === to : pathname.startsWith(to);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <FolderKanbanIcon className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-heading font-semibold">
                    Project Camp
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Team workspace
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to, item.end)}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Your projects</SidebarGroupLabel>
          <SidebarGroupAction
            title="New project"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon />
            <span className="sr-only">New project</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.isPending &&
                Array.from({ length: 3 }, (_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}

              {total === 0 && projects.isSuccess && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No projects yet
                </p>
              )}

              {projects.data?.items.map(({ project }) => {
                const to = `/projects/${project._id}`;
                return (
                  <SidebarMenuItem key={project._id}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(to)}
                    >
                      <Link to={to}>
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            projectColor(project._id),
                          )}
                        />
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{project.members}</SidebarMenuBadge>
                  </SidebarMenuItem>
                );
              })}

              {total > SIDEBAR_PROJECT_LIMIT && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="text-muted-foreground">
                    <Link to="/">
                      <span>View all {total} projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <HealthIndicator />
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />

      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Sidebar>
  );
}
