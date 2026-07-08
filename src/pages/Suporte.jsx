import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "Contato",
    paragraphs: [
      "Para dúvidas, problemas técnicos, questões sobre assinatura ou qualquer outro assunto, entre em contato pelo e-mail:",
    ],
    contact: true,
    note: "Respondemos o mais rápido possível, normalmente em até 48 horas úteis.",
  },
  {
    title: "Assinaturas",
    paragraphs: [
      "O PlayECG oferece assinatura premium (mensal e anual) com acesso completo ao conteúdo. No aplicativo iOS, as assinaturas são gerenciadas pela App Store; você pode visualizar, alterar ou cancelar sua assinatura em Ajustes > sua conta Apple > Assinaturas. Na versão web, a assinatura é gerenciada via nosso portal de pagamento.",
    ],
  },
  {
    title: "Perguntas frequentes",
    paragraphs: [
      "Para restaurar uma compra em um novo dispositivo, use o botão \"Restaurar Compras\" na tela de assinatura do aplicativo.",
    ],
  },
];

export default function Suporte() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ecg-gray">
      <header
        className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <img
              src="https://media.base44.com/images/public/68e28688c6f4ec5cd17e317d/88192cd50_903B5817-5009-4B34-8478-509B00A9C6B8.png"
              alt="PlayECG"
              className="w-8 h-8 rounded-lg"
            />
            <span className="font-nunito font-black text-ecg-midnight text-lg">
              PlayECG
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 pb-20">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-ecg-green/20 flex items-center justify-center">
            <LifeBuoy className="w-6 h-6 text-ecg-green" />
          </div>
          <div>
            <h1 className="font-nunito font-black text-2xl text-ecg-midnight leading-tight">
              Suporte — PlayECG
            </h1>
          </div>
        </div>

        <p className="text-gray-700 leading-relaxed mb-8">
          Precisa de ajuda com o PlayECG? Estamos aqui para ajudar.
        </p>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-nunito font-extrabold text-lg text-ecg-midnight mb-3">
                {section.title}
              </h2>
              {section.paragraphs?.map((p, idx) =>
                section.contact ? (
                  <div key={idx} className="space-y-2">
                    <p className="text-gray-700 leading-relaxed">{p}</p>
                    <a
                      href="mailto:ecgdescomplica@gmail.com"
                      className="inline-flex items-center gap-1.5 font-semibold text-ecg-green underline underline-offset-2 hover:opacity-80"
                    >
                      ecgdescomplica@gmail.com
                    </a>
                    <p className="text-gray-700 leading-relaxed mt-2">
                      {section.note}
                    </p>
                  </div>
                ) : (
                  <p key={idx} className="text-gray-700 leading-relaxed mb-2">
                    {p}
                  </p>
                )
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}