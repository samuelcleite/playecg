import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getCurrentUser, refreshCurrentUser } from '@/lib/currentUser';
import { createPageUrl } from "@/utils";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { BotaoPrincipal } from "@/components/BarraDeAcao";
import { useCorDaFaixa, FAIXA_CINZA } from "@/lib/faixaTopo";
import { repararNome } from "@/lib/nome";
import { notifyAdminNewUser } from "@/functions/notifyAdminNewUser";

/* Cadastro de UM toque (26/09/2026).

   Antes eram cinco campos obrigatórios — nome, especialidade numa lista de 60,
   país, estado (só UFs do Brasil, obrigatório até para quem mora fora) e cidade
   digitada — e 1 em cada 4 contas criadas pelo Google parava aqui. País, estado
   e cidade não eram usados para nada e saíram. Ficou o que a tela precisa:

   - o nome, que já vem do Google/Apple — consertado se chegou com o acento
     estragado (src/lib/nome.js);
   - a área: as cinco mais escolhidas viram botões (75% dos cadastros até
     26/09/2026) e o resto fica numa lista NATIVA atrás de "Outra área".

   A validação é desta tela, com mensagem visível. O `required` dos selects do
   Radix validava num <select> escondido, e o aviso do navegador podia não
   aparecer — a pessoa tocava no botão e nada acontecia. */

const AREAS_RAPIDAS = [
  "Estudante de medicina",
  "Clínica Médica",
  "Cardiologia",
  "Médico generalista",
  "Enfermeiro",
];

// A lista completa de antes, com os mesmos valores: o que já está gravado nas
// contas continua batendo com ela.
const TODAS_AS_AREAS = [
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

const OUTRA = "__outra__";

const LOGO = "https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png";

export default function CompleteProfile() {
  useCorDaFaixa(FAIXA_CINZA);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [nome, setNome] = useState("");
  const [escolha, setEscolha] = useState(""); // um valor de AREAS_RAPIDAS, ou OUTRA
  const [outraArea, setOutraArea] = useState(""); // valor da lista completa

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    try {
      const conta = await getCurrentUser();

      // Perfil já completo: nada a fazer aqui.
      if (conta?.profile_completed) {
        navigate(createPageUrl("Dashboard"), { replace: true });
        return;
      }

      setNome(repararNome(conta?.full_name || ""));
      const area = conta?.specialty || "";
      if (AREAS_RAPIDAS.includes(area)) {
        setEscolha(area);
      } else if (area) {
        setEscolha(OUTRA);
        setOutraArea(area);
      }
    } catch (error) {
      console.error("Erro ao carregar a conta:", error);
    } finally {
      setLoading(false);
    }
  };

  const area = escolha === OUTRA ? outraArea : escolha;

  const enviar = async (e) => {
    e.preventDefault();

    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro("Digite o seu nome.");
      return;
    }
    if (!area) {
      setErro(escolha === OUTRA ? "Escolha a sua área na lista." : "Escolha a sua área.");
      return;
    }

    // O try/catch não é decorativo: esta tela é a única saída do cadastro, e o
    // Dashboard devolve para cá enquanto profile_completed for falso. Uma falha
    // silenciosa aqui deixa a pessoa presa no app sem nada escrito na tela.
    setErro(null);
    setSalvando(true);

    try {
      // updateMyProfile grava na Account, por lista branca de campos. País,
      // estado e cidade simplesmente não vão mais.
      await base44.functions.invoke('updateMyProfile', {
        full_name: nomeLimpo,
        specialty: area,
        profile_completed: true
      });

      // Sem isso o Dashboard leria o cache anterior, com profile_completed
      // false, e mandaria a pessoa de volta para esta mesma tela.
      await refreshCurrentUser();

      // Avisa o admin do novo usuário, em background.
      notifyAdminNewUser({}).catch((err) => console.error("Falha ao notificar admin:", err));

      navigate(createPageUrl("Dashboard"), { replace: true });
    } catch (err) {
      console.error("Falha ao salvar o perfil:", err);
      // O invoke embrulha o corpo da resposta em `.data`, então a mensagem do
      // backend (ex.: "Conta não encontrada para este usuário") vem daí.
      setErro(
        err?.response?.data?.error ||
        err?.data?.error ||
        err?.message ||
        "Não foi possível salvar. Verifique sua conexão e tente de novo."
      );
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="font-nunito flex min-h-full items-center justify-center bg-[#F4F6F8] py-24">
        <Loader2 className="h-10 w-10 animate-spin text-ecg-midnight-2" />
      </div>
    );
  }

  return (
    <div className="font-nunito flex min-h-full items-start justify-center bg-[#F4F6F8] px-4 py-8 md:items-center">
      <form
        onSubmit={enviar}
        noValidate
        className="w-full max-w-md rounded-[22px] border border-[#E6EAEE] bg-white p-6"
      >
        <img src={LOGO} alt="PlayECG" className="mx-auto mb-4 block h-16 w-16 rounded-[18px]" />
        <h1 className="text-center text-[22px] font-black leading-tight text-ecg-midnight">
          Boas-vindas ao PlayECG!
        </h1>
        <p className="mt-1.5 text-center text-sm font-semibold text-[#6B7785]">
          Só uma pergunta antes do seu primeiro caso.
        </p>

        <label htmlFor="nome" className="mt-6 block text-[13px] font-extrabold text-ecg-midnight">
          Seu nome
        </label>
        <input
          id="nome"
          value={nome}
          autoComplete="name"
          onChange={(e) => {
            setNome(e.target.value);
            setErro(null);
          }}
          className="mt-1.5 h-12 w-full rounded-[14px] border border-[#DCE3EA] bg-white px-3.5 text-[15px] font-semibold text-ecg-midnight outline-none focus:border-ecg-midnight-2"
        />

        <p id="rotulo-area" className="mt-5 text-[13px] font-extrabold text-ecg-midnight">
          Qual é a sua área?
        </p>
        <div role="radiogroup" aria-labelledby="rotulo-area" className="mt-2 grid grid-cols-2 gap-2">
          {[...AREAS_RAPIDAS, OUTRA].map((valor) => {
            const ativo = escolha === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => {
                  setEscolha(valor);
                  setErro(null);
                }}
                className={`flex min-h-[48px] items-center justify-between gap-2 rounded-[14px] border-2 px-3 py-2 text-left text-[13px] font-extrabold leading-tight text-ecg-midnight transition-colors ${
                  ativo ? "border-ecg-green bg-[#E6F9EC]" : "border-[#E6EAEE] bg-white hover:border-ecg-midnight-2"
                }`}
              >
                <span>{valor === OUTRA ? "Outra área" : valor}</span>
                {ativo && <Check className="h-4 w-4 flex-none text-[#15803D]" strokeWidth={3} />}
              </button>
            );
          })}
        </div>

        {/* Lista nativa de propósito: no celular ela abre o seletor do sistema,
            que rola bem com 60 opções. */}
        {escolha === OUTRA && (
          <select
            value={outraArea}
            aria-label="Escolha a sua área"
            onChange={(e) => {
              setOutraArea(e.target.value);
              setErro(null);
            }}
            className="mt-2.5 h-12 w-full rounded-[14px] border border-[#DCE3EA] bg-white px-3 text-[15px] font-semibold text-ecg-midnight outline-none focus:border-ecg-midnight-2"
          >
            <option value="">Escolha na lista</option>
            {TODAS_AS_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        {erro && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#FDECEC] p-3.5">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-[#C0392B]" />
            <p className="text-[13px] font-bold text-[#8A1F17]">{erro}</p>
          </div>
        )}

        <div className="mt-6">
          <BotaoPrincipal type="submit" ocupado={salvando}>
            {salvando ? "SALVANDO" : "COMEÇAR"}
          </BotaoPrincipal>
        </div>
        <p className="mt-3 text-center text-xs font-semibold text-[#9AA6B2]">
          Você pode mudar isso depois, no seu perfil.
        </p>
      </form>
    </div>
  );
}
