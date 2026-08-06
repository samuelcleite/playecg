import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, refreshCurrentUser } from '@/lib/currentUser';
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
import { Activity, User as UserIcon, MapPin, Stethoscope, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { notifyAdminNewUser } from "@/functions/notifyAdminNewUser";

export default function CompleteProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [formData, setFormData] = useState({
    full_name: "",
    specialty: "",
    country: "",
    state: "",
    city: ""
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      
      // Se o perfil já foi completado, redirecionar para o dashboard
      if (userData.profile_completed) {
        navigate(createPageUrl("Dashboard"));
        return;
      }

      // O bloco que forçava subscription_type: "free" foi removido. O schema da
      // Account já materializa esse default na criação, então o campo nunca vem
      // vazio — e escrevê-lo daqui seria pedir ao servidor para aceitar
      // subscription_type vindo do cliente, que é justamente o que o
      // updateMyProfile recusa a fazer.

      setFormData({
        full_name: userData.full_name || "",
        specialty: userData.specialty || "",
        country: userData.country || "",
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

    // O try/catch não é decorativo: esta tela é a única saída do cadastro, e o
    // Dashboard devolve para cá enquanto profile_completed for falso. Uma falha
    // silenciosa aqui não é "o salvamento não funcionou" — é o usuário preso no
    // app sem nada escrito na tela explicando por quê. Foi exatamente o que
    // aconteceu enquanto o `base44` deste arquivo estava sem import.
    setErro(null);
    setSalvando(true);

    try {
      // updateMyProfile grava na Account. subscription_type NÃO vai junto: a
      // function ignora o campo de propósito, porque aceitá-lo do cliente
      // permitiria um POST com subscription_type: "premium". O default do schema
      // já cuida disso na criação da Account.
      await base44.functions.invoke('updateMyProfile', {
        full_name: formData.full_name,
        specialty: formData.specialty,
        country: formData.country,
        state: formData.state,
        city: formData.city,
        profile_completed: true
      });

      // Sem isso o Dashboard leria o cache anterior, com profile_completed false,
      // e mandaria o usuário de volta para esta mesma tela.
      await refreshCurrentUser();

      // Notifica o admin sobre o novo usuário (em background, sem bloquear a navegação)
      notifyAdminNewUser({}).catch((err) => console.error("Falha ao notificar admin:", err));

      navigate(createPageUrl("Dashboard"));
    } catch (err) {
      console.error("Falha ao salvar o perfil:", err);
      // O invoke embrulha o corpo da resposta em `.data`, então a mensagem do
      // backend (ex.: "Conta não encontrada para este usuário") vem daí.
      setErro(
        err?.response?.data?.error ||
        err?.data?.error ||
        err?.message ||
        "Não foi possível salvar seu perfil. Verifique sua conexão e tente novamente."
      );
      setSalvando(false);
    }
  };

  const especialidades = [
    "Acupuntura",
    "Alergia e Imunologia",
    "Anestesiologia",
    "Angiologia",
    "Cardiologia",
    "Cirurgia Cardiovascular",
    "Cirurgia da Mão",
    "Cirurgia de Cabeça e Pescoço",
    "Cirurgia do Aparelho Digestivo",
    "Cirurgia Geral",
    "Cirurgia Oncológica",
    "Cirurgia Pediátrica",
    "Cirurgia Plástica",
    "Cirurgia Torácica",
    "Cirurgia Vascular",
    "Clínica Médica",
    "Coloproctologia",
    "Dermatologia",
    "Endocrinologia e Metabologia",
    "Enfermeiro",
    "Estudante de medicina",
    "Farmacêutico",
    "Fisioterapeuta",
    "Gastroenterologia",
    "Genética Médica",
    "Geriatria",
    "Ginecologia e Obstetrícia",
    "Hematologia e Hemoterapia",
    "Homeopatia",
    "Infectologia",
    "Mastologia",
    "Medicina de Família e Comunidade",
    "Medicina do Esporte",
    "Medicina do Trabalho",
    "Medicina do Tráfego",
    "Medicina Física e Reabilitação",
    "Medicina Intensiva",
    "Medicina Legal",
    "Medicina Nuclear",
    "Medicina Preventiva e Social",
    "Médico generalista",
    "Nefrologia",
    "Neurocirurgia",
    "Neurologia",
    "Nutrologia",
    "Oftalmologia",
    "Oncologia Clínica",
    "Ortopedia e Traumatologia",
    "Otorrinolaringologia",
    "Paramédicos",
    "Patologia",
    "Pediatria",
    "Pneumologia",
    "Psiquiatria",
    "Radiologia e Diagnóstico por Imagem",
    "Radioterapia",
    "Reumatologia",
    "Técnico de enfermagem",
    "Urologia",
    "Outros profissionais"
  ];

  const paises = [
    "Brasil", "Estados Unidos", "Argentina", "Chile", "Colômbia", "México", 
    "Peru", "Uruguai", "Paraguai", "Bolívia", "Venezuela", "Equador",
    "Portugal", "Espanha", "Reino Unido", "França", "Alemanha", "Itália",
    "Canadá", "Austrália", "China", "Japão", "Índia", "Outro"
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
              Bem-vindo ao PlayECG!
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

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 font-medium">
                  <MapPin className="w-4 h-4" />
                  País
                </Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                  required
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione seu país" />
                  </SelectTrigger>
                  <SelectContent>
                    {paises.map((pais) => (
                      <SelectItem key={pais} value={pais}>
                        {pais}
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

              {erro && (
                <div
                  role="alert"
                  className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-900">{erro}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={salvando}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-lg font-semibold shadow-lg"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  "Criar Conta"
                )}
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