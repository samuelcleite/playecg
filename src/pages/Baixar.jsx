import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Apple, Play, Globe } from "lucide-react";
import { isAppleDevice, isDespiaApp, isAndroidNativeApp } from "@/utils/platform";

// Link único e divulgável: playecg.app/baixar. Existe para caber em bio de
// Instagram, QR code e material impresso sem virar três links diferentes — e
// para continuar nosso mesmo quando um serviço de encurtador sair do ar (foi o
// que aconteceu com o Firebase Dynamic Links, desligado em 25/08/2025).
const APP_STORE = "https://apps.apple.com/br/app/playecg/id6787499219";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.playecg.app";

// A detecção de Apple vive em utils/platform.js e não é reescrita aqui de
// propósito: ela já trata o iPad moderno, que se apresenta como "Macintosh" e
// só se denuncia pelo maxTouchPoints. Mac de mesa continua caindo fora dela, que
// é o certo — quem abre isto no desktop quer a web, não a App Store.
// O Android é testado pelo user agent, e não por isAndroidNativeApp(): aquela
// pergunta se estamos DENTRO do wrapper Capacitor, não se o aparelho é Android.
function lojaDoAparelho() {
  if (isAppleDevice()) return { url: APP_STORE, nome: "App Store" };
  if (/android/i.test(navigator.userAgent || "")) return { url: PLAY_STORE, nome: "Google Play" };
  return null;
}

export default function Baixar() {
  const navigate = useNavigate();
  const [loja] = useState(lojaDoAparelho);

  useEffect(() => {
    // Dentro do app nativo não existe "baixar": mandar o usuário para a loja de
    // onde ele acabou de instalar é um beco sem saída.
    if (isDespiaApp() || isAndroidNativeApp()) {
      navigate("/", { replace: true });
      return;
    }
    if (!loja) return; // desktop: fica na página, com as três opções à mão
    // replace() e não href: assim o "voltar" leva de volta para onde a pessoa
    // estava (o post, a bio), e não para esta rota, que redirecionaria de novo.
    window.location.replace(loja.url);
  }, [loja, navigate]);

  return (
    <div className="min-h-screen bg-[#0D3B66] flex flex-col">
      <main className="flex-1 px-6 py-12 max-w-lg mx-auto w-full flex flex-col justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl overflow-hidden shadow-xl">
              <img
                src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png"
                alt="PlayECG"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Baixe o PlayECG</h1>
            <p className="text-blue-200 text-sm">
              {loja
                ? `Abrindo a ${loja.nome}…`
                : "Aprenda ECG jogando. Escolha por onde quer começar."}
            </p>
          </div>

          {/* As três opções ficam sempre visíveis. Se o redirecionamento for
              bloqueado (navegador embutido do Instagram, extensão, aparelho que
              o user agent não identifica), a página continua servindo. */}
          <div className="space-y-3">
            <a
              href={APP_STORE}
              className="flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-2xl p-4 transition-colors"
            >
              <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center flex-shrink-0">
                <Apple className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">iPhone e iPad</p>
                <p className="text-blue-200 text-xs">Baixar na App Store</p>
              </div>
            </a>

            <a
              href={PLAY_STORE}
              className="flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-2xl p-4 transition-colors"
            >
              <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center flex-shrink-0">
                <Play className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Android</p>
                <p className="text-blue-200 text-xs">Baixar no Google Play</p>
              </div>
            </a>

            <a
              href="/"
              className="flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-2xl p-4 transition-colors"
            >
              <div className="w-10 h-10 bg-[#0D1E30] rounded-xl flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Computador</p>
                <p className="text-blue-200 text-xs">Usar direto no navegador</p>
              </div>
            </a>
          </div>
        </motion.div>
      </main>

      <footer className="py-6 text-center text-blue-400 text-xs border-t border-blue-800">
        playecg.app/baixar
      </footer>
    </div>
  );
}
