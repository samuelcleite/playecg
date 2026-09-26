import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BellOff, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import TelaDeAviso from "@/components/caso/TelaDeAviso";
import { BotaoPrincipal, BotaoSecundario } from "@/components/BarraDeAcao";

// Página do link "Desativar lembretes" dos e-mails do lembretesDiarios.
// -----------------------------------------------------------------------------
// Pública e sem login (ver desativarLembretes): quem quer parar de receber
// e-mail não pode precisar entrar no app para isso.
//
// A desativação acontece no TOQUE do botão, não ao abrir a página. Filtros de
// e-mail corporativo e antivírus abrem os links sozinhos para inspecionar; se a
// abertura já desativasse, a pessoa perderia os lembretes sem ter pedido.
// -----------------------------------------------------------------------------

export default function Lembretes() {
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const [estado, setEstado] = useState(token ? "pergunta" : "erro"); // pergunta | enviando | pronto | erro
  const [erro, setErro] = useState(token ? null : "Este link está incompleto.");

  const desativar = async () => {
    setEstado("enviando");
    setErro(null);
    try {
      const res = await base44.functions.invoke("desativarLembretes", { t: token });
      if (res?.data?.success) {
        setEstado("pronto");
      } else {
        setErro(res?.data?.error || "Não foi possível desativar.");
        setEstado("erro");
      }
    } catch (e) {
      // O invoke embrulha o corpo em `.data`; a mensagem do backend vem daí.
      setErro(e?.response?.data?.error || e?.data?.error || "Não foi possível desativar agora. Tente de novo.");
      setEstado("erro");
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8]" style={{ paddingTop: "var(--app-safe-top-fluxo, 0px)" }}>
      {estado === "pronto" ? (
        <TelaDeAviso
          Icone={CheckCircle2}
          tom="verde"
          titulo="Lembretes desativados"
          texto="Pronto. Você não vai mais receber lembretes do PlayECG por e-mail nem por notificação."
          acoes={<BotaoPrincipal to="/">IR PARA O PLAYECG</BotaoPrincipal>}
        />
      ) : estado === "erro" ? (
        <TelaDeAviso
          Icone={AlertTriangle}
          tom="ambar"
          titulo="Não deu certo"
          texto={erro}
          acoes={
            <>
              {token && <BotaoPrincipal onClick={desativar}>TENTAR DE NOVO</BotaoPrincipal>}
              <BotaoSecundario to="/">Ir para o PlayECG</BotaoSecundario>
            </>
          }
          rodape={
            <>
              Se continuar, escreva para{" "}
              <a href="mailto:ecgdescomplica@gmail.com" className="underline">
                ecgdescomplica@gmail.com
              </a>{" "}
              e a gente desativa por você.
            </>
          }
        />
      ) : (
        <TelaDeAviso
          Icone={BellOff}
          tom="azul"
          titulo="Desativar lembretes"
          texto="Você vai deixar de receber os lembretes do PlayECG por e-mail e por notificação. Sua conta e o seu progresso continuam iguais."
          acoes={
            <>
              <BotaoPrincipal onClick={desativar} ocupado={estado === "enviando"}>
                DESATIVAR LEMBRETES
              </BotaoPrincipal>
              <BotaoSecundario to="/">Voltar ao PlayECG</BotaoSecundario>
            </>
          }
          rodape={
            <>
              Detalhes na <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
            </>
          }
        />
      )}
    </div>
  );
}
