import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { User } from "@/entities/User";
import { calculateStreakDays } from "@/components/StreakCalculator";
import FaleConosco from "@/components/FaleConosco";
import {
  Activity,
  Home,
  Brain,
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
  MessageCircle
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
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [user, setUser] = React.useState(null);
  const [streakDays, setStreakDays] = React.useState(0);
  const [showFaleConosco, setShowFaleConosco] = React.useState(false);

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await User.me();
      setUser(userData);
      
      const streak = await calculateStreakDays(userData.email);
      setStreakDays(streak);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const isPremium = user?.subscription_type === "premium";
  const isAdmin = user?.role === "admin";

  const navigationItems = [
    {
      title: "Dashboard",
      url: createPageUrl("Dashboard"),
      icon: Home
    },
    {
      title: "Quiz",
      url: createPageUrl("Quiz"),
      icon: Brain
    },
    ...(isPremium ? [{
      title: "Módulos",
      url: createPageUrl("Modules"),
      icon: BookOpen
    }] : []),
    {
      title: "Conquistas",
      url: createPageUrl("Achievements"),
      icon: Award
    },
    {
      title: "Aprenda ECG",
      url: createPageUrl("AprendaECG"),
      icon: BookOpen
    },
    {
      title: "Perfil",
      url: createPageUrl("Profile"),
      icon: Trophy
    }];


  const educationItems = [
    {
      title: "Banco de Imagens",
      url: createPageUrl("AdminImages"),
      icon: Image
    },
    {
      title: "Gerenciar Módulos",
      url: createPageUrl("AdminModules"),
      icon: FolderOpen
    },
    {
      title: "Gerenciar Fases",
      url: createPageUrl("AdminPhases"),
      icon: Layers
    },
    {
      title: "Gerenciar Casos",
      url: createPageUrl("AdminCases"),
      icon: FileEdit
    },
    {
      title: "Casos do Dia",
      url: createPageUrl("AdminDailyCases"),
      icon: Calendar
    },
    {
      title: "Gestão de Conteúdo",
      url: createPageUrl("AdminContent"),
      icon: FileText
    },
    {
      title: "Gerenciar Conquistas",
      url: createPageUrl("AdminAchievements"),
      icon: Award
    }
  ];

  const adminItems = [
    {
      title: "Gerenciar Cupons",
      url: createPageUrl("AdminCoupons"),
      icon: Ticket
    },
    {
      title: "Estatísticas de Cupons",
      url: createPageUrl("AdminCouponStats"),
      icon: BarChart3
    },
    {
      title: "Gerenciar Pagamentos",
      url: createPageUrl("AdminPayments"),
      icon: CreditCard
    },
    {
      title: "Gerenciar Usuários",
      url: createPageUrl("AdminUsers"),
      icon: Users
    }
  ];

  const handleLogout = async () => {
    await User.logout();
  };

  return (
    <SidebarProvider>
      <style>{`
        :root {
          --primary: 210 80% 75%;
          --primary-foreground: 210 40% 25%;
          --success: 142 60% 75%;
          --error: 0 70% 80%;
        }
      `}</style>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <Sidebar className="border-r border-purple-100 bg-white/90 backdrop-blur-sm">
          <SidebarHeader className="border-b border-purple-100 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-200 to-pink-200 rounded-xl flex items-center justify-center shadow-md">
                <Activity className="w-6 h-6 text-purple-700" />
              </div>
              <div>
                <h2 className="font-bold text-gray-800 text-lg">ECG Learning</h2>
                <p className="text-xs text-gray-500">Aprenda laudos de ECG</p>
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
                        className={`hover:bg-purple-50 hover:text-purple-700 transition-all duration-200 rounded-lg mb-1 ${
                          location.pathname === item.url ? 'bg-purple-100 text-purple-700 font-medium' : ''
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
                  <SidebarGroupLabel className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Gestão Educação
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {educationItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            className={`hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 rounded-lg mb-1 ${
                              location.pathname === item.url ? 'bg-blue-100 text-blue-700 font-medium' : ''
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
                  <SidebarGroupLabel className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Administração
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {adminItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                            className={`hover:bg-pink-50 hover:text-pink-700 transition-all duration-200 rounded-lg mb-1 ${
                              location.pathname === item.url ? 'bg-pink-100 text-pink-700 font-medium' : ''
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
                  <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-4 text-amber-900 shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer border border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="w-5 h-5" />
                      <span className="font-semibold">Upgrade Premium</span>
                    </div>
                    <p className="text-xs text-amber-800">
                      Desbloqueie módulos estruturados e gamificação completa
                    </p>
                  </div>
                </Link>
              </div>
            )}


          </SidebarContent>

          <SidebarFooter className="border-t border-purple-100 p-4">
            {user && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-200 to-pink-200 rounded-full flex items-center justify-center">
                    <span className="text-purple-700 font-semibold text-sm">
                      {user.full_name?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      {user.full_name || 'Usuário'}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      {isAdmin && (
                        <Badge className="bg-pink-200 text-pink-800 text-xs">Admin</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFaleConosco(true)}
                  className="w-full gap-2 border-blue-200 hover:bg-blue-50 mb-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  Fale Conosco
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full gap-2 border-purple-200 hover:bg-purple-50"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </Button>
                </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col">
          <header className="bg-white/90 backdrop-blur-sm border-b border-purple-100 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-purple-50 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-bold text-gray-800">Descomplica ECG</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
        </div>

        <FaleConosco open={showFaleConosco} onOpenChange={setShowFaleConosco} />
        </SidebarProvider>
        );
        }