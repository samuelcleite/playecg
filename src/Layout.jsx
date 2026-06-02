import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  Activity,
  Home,
  Shuffle,
  ListOrdered,
  BookOpen,
  Trophy,
  Crown,
  LogOut,
  Settings,
  FileEdit,
  FolderOpen,
  Layers,
  Image,
  Ticket,
  BarChart3,
  CreditCard,
  Users,
  Award,
  FileText,
  Calendar,
  User
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  if (currentPageName === "Home") {
    return <>{children}</>;
  }

  const isPremium = user?.subscription_type === "premium";
  const isAdmin = user?.role === "admin";

  const navigationItems = [
    { title: "Dashboard", url: createPageUrl("Dashboard"), icon: Home },
    ...(isPremium ? [{ title: "Módulos", url: createPageUrl("Modules"), icon: ListOrdered }] : []),
    { title: "Quiz", url: createPageUrl("Quiz"), icon: Shuffle },
    { title: "Troféus", url: createPageUrl("Achievements"), icon: Award },
    { title: "Aprenda ECG", url: createPageUrl("AprendaECG"), icon: BookOpen },
    { title: "Perfil", url: createPageUrl("Profile"), icon: User },
  ];

  const educationItems = [
    { title: "Banco de Imagens", url: createPageUrl("AdminImages"), icon: Image },
    { title: "Gerenciar Módulos", url: createPageUrl("AdminModules"), icon: FolderOpen },
    { title: "Gerenciar Fases", url: createPageUrl("AdminPhases"), icon: Layers },
    { title: "Gerenciar Casos", url: createPageUrl("AdminCases"), icon: FileEdit },
    { title: "Casos do Dia", url: createPageUrl("AdminDailyCases"), icon: Calendar },
    { title: "Gestão de Conteúdo", url: createPageUrl("AdminContent"), icon: FileText },
    { title: "Gerenciar Troféus", url: createPageUrl("AdminAchievements"), icon: Award },
  ];

  const adminItems = [
    { title: "Gerenciar Cupons", url: createPageUrl("AdminCoupons"), icon: Ticket },
    { title: "Estatísticas de Cupons", url: createPageUrl("AdminCouponStats"), icon: BarChart3 },
    { title: "Gerenciar Pagamentos", url: createPageUrl("AdminPayments"), icon: CreditCard },
    { title: "Gerenciar Usuários", url: createPageUrl("AdminUsers"), icon: Users },
    { title: "Gerenciar Atividade", url: createPageUrl("AdminActivity"), icon: Activity },
  ];

  const handleLogout = async () => {
    await base44.auth.logout("/");
  };

  return (
    <>
      <style>{`
        html, body, #root {
          height: 100%;
        }
      `}</style>

      {/* ── DESKTOP: sidebar + content ── */}
      <div className="hidden md:flex min-h-screen w-full bg-ecg-gray">
        <SidebarProvider>
          <Sidebar className="border-r border-ecg-midnight bg-ecg-midnight">
            <SidebarHeader className="border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <img src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/68dd8d49f_generated_image.png" alt="PlayECG" className="w-10 h-10 rounded-xl shadow-md" />
                <div>
                  <h2 className="font-nunito font-black text-white text-lg tracking-tight">PlayECG</h2>
                  <p className="text-xs text-ecg-green/80">Aprenda ECG jogando</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent className="p-3">
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navigationItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className={`hover:bg-white/10 hover:text-white transition-all duration-200 rounded-xl mb-1 text-white/80 font-nunito font-semibold ${
                            location.pathname === item.url ? 'bg-ecg-green/20 text-ecg-green font-bold' : ''
                          }`}
                        >
                          <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                            <item.icon className="w-5 h-5" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {isAdmin && (
                <>
                  <Separator className="my-4" />
                  <SidebarGroup>
                    <SidebarGroupLabel className="text-xs font-medium text-blue-300 uppercase tracking-wider px-2 py-2 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Gestão Educação
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {educationItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              asChild
                              className={`hover:bg-white/10 hover:text-white transition-all duration-200 rounded-xl mb-1 text-white/80 font-nunito font-semibold ${
                                location.pathname === item.url ? 'bg-ecg-green/20 text-ecg-green font-bold' : ''
                              }`}
                            >
                              <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                                <item.icon className="w-5 h-5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>

                  <Separator className="my-4" />
                  <SidebarGroup>
                    <SidebarGroupLabel className="text-xs font-semibold text-white/50 uppercase tracking-wider px-2 py-2 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Administração
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {adminItems.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              asChild
                              className={`hover:bg-white/10 hover:text-white transition-all duration-200 rounded-xl mb-1 text-white/80 font-nunito font-semibold ${
                                location.pathname === item.url ? 'bg-ecg-green/20 text-ecg-green font-bold' : ''
                              }`}
                            >
                              <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                                <item.icon className="w-5 h-5" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </>
              )}

              {!isPremium && (
                <div className="mt-4 mx-2">
                  <Link to={createPageUrl("Upgrade")}>
                    <div className="bg-ecg-green rounded-2xl p-4 text-ecg-midnight shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <Crown className="w-5 h-5" />
                        <span className="font-nunito font-black text-sm">Upgrade Premium</span>
                      </div>
                      <p className="text-xs font-semibold opacity-80">
                        Desbloqueie módulos e gamificação completa
                      </p>
                    </div>
                  </Link>
                </div>
              )}
            </SidebarContent>

            <SidebarFooter className="border-t border-white/10 p-4">
              {user && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-ecg-green rounded-full flex items-center justify-center">
                      <span className="text-ecg-midnight font-black text-sm">
                        {user.full_name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-nunito font-bold text-white text-sm truncate">
                        {user.full_name || 'Usuário'}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-white/50 truncate">{user.email}</p>
                        {isAdmin && (
                          <Badge className="bg-ecg-green text-ecg-midnight text-xs font-bold">Admin</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full gap-2 border-white/20 text-white/70 hover:bg-white/10 hover:text-white rounded-xl"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </Button>
                </div>
              )}
            </SidebarFooter>
          </Sidebar>

          <main className="flex-1 overflow-auto bg-ecg-gray">
            {children}
          </main>
        </SidebarProvider>
      </div>

      {/* ── MOBILE: content + bottom nav ── */}
      <div className="md:hidden flex flex-col w-full bg-ecg-gray" style={{ minHeight: '100dvh' }}>
        <main className="flex-1 overflow-y-auto pb-32" style={{ height: '100%' }}>
          {children}
        </main>

        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999, backgroundColor: '#FFFFFF', borderTop: '1px solid #E0E0E0', boxShadow: '0 -2px 12px rgba(0,0,0,0.08)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-around px-2 py-3">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.url;
              return (
                <Link
                  key={item.title}
                  to={item.url}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 min-w-[44px] ${
                    isActive
                      ? 'text-ecg-midnight bg-ecg-green/20'
                      : 'text-gray-400 hover:text-ecg-midnight hover:bg-ecg-gray'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-semibold leading-tight">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </>
  );
}