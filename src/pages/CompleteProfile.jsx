
import { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, User as UserIcon, MapPin, Stethoscope } from "lucide-react";
import { motion } from "framer-motion";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    full_name: "",
    specialty: "",
    state: "",
    city: ""
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await User.me();
      setUser(userData);
      
      // Se o perfil já foi completado, redirecionar para o dashboard
      if (userData.profile_completed) {
        navigate(createPageUrl("Dashboard"));
        return;
      }

      // Garantir que o subscription_type seja "free" se não estiver definido
      if (!userData.subscription_type) {
        await User.updateMyUserData({ subscription_type: "free" });
        // Optionally, update userData object locally to reflect the change for subsequent formData set
        userData.subscription_type = "free"; 
      }

      setFormData({
        full_name: userData.full_name || "",
        specialty: userData.specialty || "",
        state: userData.state || "",
        city: userData.city || ""
      });
      setLoading(false);
    } catch (error) {
      console.error("Erro ao carregar usuário:", error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    await User.updateMyUserData({
      full_name: formData.full_name,
      specialty: formData.specialty,
      state: formData.state,
      city: formData.city,
      profile_completed: true,
      subscription_type: "free" // Garantir que seja "free" ao completar perfil
    });

    navigate(createPageUrl("Dashboard"));
  };

  const especialidades = [
    "Cardiologia",
    "Clínica Médica",
    "Medicina de Emergência",
    "Medicina Intensiva",
    "Anestesiologia",
    "Medicina de Família e Comunidade",
    "Geriatria",
    "Pediatria",
    "Cirurgia Geral",
    "Enfermagem",
    "Fisioterapia",
    "Estudante de Medicina",
    "Estudante de Enfermagem",
    "Outra"
  ];

  const estados = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center">
          <Activity className="w-12 h-12 animate-pulse text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <Card className="border-none shadow-2xl">
          <CardHeader className="text-center pb-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-xl">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Activity className="w-10 h-10 text-blue-600" />
            </div>
            <CardTitle className="text-3xl font-bold mb-2">
              Bem-vindo ao Descomplica ECG!
            </CardTitle>
            <p className="text-blue-100">
              Complete seu perfil para personalizar sua experiência de aprendizado
            </p>
          </CardHeader>

          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 font-medium">
                  <UserIcon className="w-4 h-4" />
                  Nome Completo
                </Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Digite seu nome completo"
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 font-medium">
                  <Stethoscope className="w-4 h-4" />
                  Especialidade / Área de Atuação
                </Label>
                <Select
                  value={formData.specialty}
                  onValueChange={(value) => setFormData({ ...formData, specialty: value })}
                  required
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione sua especialidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {especialidades.map((esp) => (
                      <SelectItem key={esp} value={esp}>
                        {esp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-gray-700 font-medium">
                    <MapPin className="w-4 h-4" />
                    Estado
                  </Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => setFormData({ ...formData, state: value })}
                    required
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {estados.map((estado) => (
                        <SelectItem key={estado} value={estado}>
                          {estado}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-gray-700 font-medium">
                    <MapPin className="w-4 h-4" />
                    Cidade
                  </Label>
                  <Input
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Digite sua cidade"
                    required
                    className="h-12"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>📊 Por que coletamos essas informações?</strong>
                  <br />
                  Esses dados nos ajudam a personalizar sua experiência de aprendizado e a entender melhor nossa comunidade de usuários. Suas informações são mantidas em sigilo.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-lg font-semibold shadow-lg"
              >
                Continuar para o Dashboard
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-6">
          Você poderá editar essas informações a qualquer momento em seu perfil
        </p>
      </motion.div>
    </div>
  );
}
