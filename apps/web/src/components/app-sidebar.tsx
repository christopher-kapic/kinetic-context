import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { FolderKanban, Package, Brain, BookOpen } from "lucide-react";

const navItems = [
  {
    title: "Projects",
    url: "/projects",
    icon: FolderKanban,
  },
  {
    title: "Packages",
    url: "/packages",
    icon: Package,
  },
  {
    title: "Models",
    url: "/models",
    icon: Brain,
  },
];

const externalNavItems = [
  {
    title: "Documentation",
    url: "https://kctx.dev",
    icon: BookOpen,
    external: true,
  },
];

export function AppSidebar() {
  const router = useRouterState();
  const pathname = router.location.pathname;

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-2">
          <Link to="/">
            <h1 className="text-sm font-semibold">Kinetic Context</h1>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url || pathname.startsWith(item.url + "/")}
                    tooltip={item.title}
                  >
                    <Link 
                      to={item.url}
                      className="flex w-full items-center gap-2 h-full"
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {externalNavItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                  >
                    <a 
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2 h-full"
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-2">
          <ModeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
