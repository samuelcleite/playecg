import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  TrendingUp, 
  DollarSign, 
  Ticket,
  Calendar,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function AdminCouponStats() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [usages, setUsages] = useState([]);
  const [stats, setStats] = useState({
    totalCoupons: 0,
    activeCoupons: 0,
    totalUsages: 0,
    totalRevenue: 0,
    totalDiscounts: 0,
    uniqueUsers: 0
  });
  const [expandedCoupon, setExpandedCoupon] = useState(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadData();
  };

  const loadData = async () => {
    const couponsData = await base44.entities.Coupon.list("-created_date");
    setCoupons(couponsData);

    const usagesData = await base44.entities.CouponUsage.list("-used_at");
    setUsages(usagesData);

    // Calcular estatísticas gerais
    const uniqueUsersSet = new Set(usagesData.map(u => u.user_email));
    const totalRevenue = usagesData.reduce((sum, u) => sum + u.final_price, 0);
    const totalDiscounts = usagesData.reduce((sum, u) => sum + u.discount_applied, 0);

    setStats({
      totalCoupons: couponsData.length,
      activeCoupons: couponsData.filter(c => c.active).length,
      totalUsages: usagesData.length,
      totalRevenue: totalRevenue,
      totalDiscounts: totalDiscounts,
      uniqueUsers: uniqueUsersSet.size
    });
  };

  const getCouponUsages = (couponId) => {
    return usages.filter(u => u.coupon_id === couponId);
  };

  const getCouponStats = (couponId) => {
    const couponUsages = getCouponUsages(couponId);
    return {
      usageCount: couponUsages.length,
      totalRevenue: couponUsages.reduce((sum, u) => sum + u.final_price, 0),
      totalDiscount: couponUsages.reduce((sum, u) => sum + u.discount_applied, 0),
      uniqueUsers: new Set(couponUsages.map(u => u.user_email)).size
    };
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Estatísticas de Cupons</h1>
          <p className="text-gray-500 mt-1">Análise de uso e performance dos cupons de desconto</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total de Cupons</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{stats.totalCoupons}</p>
                  <p className="text-xs text-gray-500 mt-1">{stats.activeCoupons} ativos</p>
                </div>
                <Ticket className="w-12 h-12 text-purple-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Usos Totais</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{stats.totalUsages}</p>
                  <p className="text-xs text-gray-500 mt-1">{stats.uniqueUsers} usuários únicos</p>
                </div>
                <TrendingUp className="w-12 h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Receita Total</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">
                    R$ {stats.totalRevenue.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    R$ {stats.totalDiscounts.toFixed(2)} em descontos
                  </p>
                </div>
                <DollarSign className="w-12 h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coupons Performance Table */}
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Performance por Cupom</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {coupons.map((coupon) => {
                const couponStats = getCouponStats(coupon.id);
                const couponUsages = getCouponUsages(coupon.id);
                const isExpanded = expandedCoupon === coupon.id;

                return (
                  <motion.div
                    key={coupon.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <div className="p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                         onClick={() => setExpandedCoupon(isExpanded ? null : coupon.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-lg text-gray-900">
                                {coupon.code}
                              </span>
                              {coupon.active ? (
                                <Badge className="bg-green-500 text-white">Ativo</Badge>
                              ) : (
                                <Badge className="bg-gray-400 text-white">Inativo</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{coupon.description || "Sem descrição"}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Usos</p>
                            <p className="text-lg font-bold text-blue-600">{couponStats.usageCount}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Usuários</p>
                            <p className="text-lg font-bold text-purple-600">{couponStats.uniqueUsers}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Receita</p>
                            <p className="text-lg font-bold text-green-600">
                              R$ {couponStats.totalRevenue.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">Desconto</p>
                            <p className="text-lg font-bold text-orange-600">
                              R$ {couponStats.totalDiscount.toFixed(2)}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && couponUsages.length > 0 && (
                      <div className="p-4 bg-white border-t border-gray-200">
                        <h4 className="font-semibold text-gray-900 mb-3">Histórico de Uso</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Usuário</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Preço Original</TableHead>
                              <TableHead>Desconto</TableHead>
                              <TableHead>Preço Final</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {couponUsages.map((usage) => (
                              <TableRow key={usage.id}>
                                <TableCell className="font-medium">{usage.user_email}</TableCell>
                                <TableCell>
                                  {format(new Date(usage.used_at), 'dd/MM/yyyy HH:mm')}
                                </TableCell>
                                <TableCell>R$ {usage.original_price.toFixed(2)}</TableCell>
                                <TableCell className="text-orange-600 font-semibold">
                                  -R$ {usage.discount_applied.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-green-600 font-semibold">
                                  R$ {usage.final_price.toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {isExpanded && couponUsages.length === 0 && (
                      <div className="p-4 bg-white border-t border-gray-200 text-center text-gray-500">
                        Este cupom ainda não foi utilizado
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {coupons.length === 0 && (
                <div className="text-center py-12">
                  <Ticket className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Nenhum cupom encontrado
                  </h3>
                  <p className="text-gray-600">
                    Crie cupons para começar a ver as estatísticas
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Usage */}
        {usages.length > 0 && (
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Usos Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cupom</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Desconto Aplicado</TableHead>
                    <TableHead>Valor Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usages.slice(0, 10).map((usage) => {
                    const coupon = coupons.find(c => c.id === usage.coupon_id);
                    return (
                      <TableRow key={usage.id}>
                        <TableCell>
                          <span className="font-mono font-bold text-purple-600">
                            {coupon?.code || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell>{usage.user_email}</TableCell>
                        <TableCell>
                          {format(new Date(usage.used_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        <TableCell className="text-orange-600 font-semibold">
                          -R$ {usage.discount_applied.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-green-600 font-semibold">
                          R$ {usage.final_price.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}