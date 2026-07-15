import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "1. Aceitação",
    paragraphs: [
      "Ao criar uma conta ou assinar o PlayECG, você concorda com estes Termos de Uso.",
    ],
  },
  {
    title: "2. Sobre o serviço",
    paragraphs: [
      "O PlayECG é um aplicativo educacional para estudo de eletrocardiograma (ECG), destinado a estudantes e profissionais de saúde. É uma ferramenta de ensino: não é um dispositivo médico e não deve ser usado para diagnóstico ou decisão clínica sobre pacientes reais.",
    ],
  },
  {
    title: "3. Assinaturas",
    paragraphs: [
      "O PlayECG oferece assinaturas premium nas modalidades mensal e anual, com acesso completo ao conteúdo.",
    ],
    items: [
      "As assinaturas são de renovação automática.",
      "A cobrança é feita no momento da confirmação da compra e a cada renovação.",
      "A renovação automática pode ser desativada a qualquer momento até 24 horas antes do fim do período vigente.",
      "No iOS, a assinatura é gerenciada pela sua conta Apple. Para visualizar, alterar ou cancelar, acesse Ajustes > sua conta Apple > Assinaturas.",
      'Para restaurar uma compra em outro dispositivo, use o botão "Restaurar Compras" na tela de assinatura.',
    ],
  },
  {
    title: "4. Conta",
    paragraphs: [
      "Você é responsável por manter a confidencialidade das suas credenciais. Você pode excluir sua conta a qualquer momento na área de Perfil do aplicativo.",
    ],
  },
  {
    title: "5. Uso aceitável",
    paragraphs: [
      "O conteúdo do PlayECG é de uso pessoal e educacional. É vedada a reprodução, redistribuição ou revenda do conteúdo sem autorização.",
    ],
  },
  {
    title: "6. Privacidade",
    privacy: true,
  },
  {
    title: "7. Alterações",
    paragraphs: [
      "Podemos atualizar estes Termos. Alterações relevantes serão comunicadas no aplicativo.",
    ],
  },
  {
    title: "8. Contato",
    contact: true,
  },
];

export default function Termos() {
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
            onClick={() => {
              if (window.history.state && window.history.state.idx > 0) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
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
            <FileText className="w-6 h-6 text-ecg-green" />
          </div>
          <div>
            <h1 className="font-nunito font-black text-2xl text-ecg-midnight leading-tight">
              Termos de Uso
            </h1>
            <p className="text-sm text-gray-500">
              Última atualização: 15 de julho de 2026
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-nunito font-extrabold text-lg text-ecg-midnight mb-3">
                {section.title}
              </h2>
              {section.paragraphs?.map((p, idx) => (
                <p key={idx} className="text-gray-700 leading-relaxed mb-2">
                  {p}
                </p>
              ))}
              {section.items && (
                <ul className="space-y-2 mb-2">
                  {section.items.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex gap-2.5 text-gray-700 leading-relaxed"
                    >
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ecg-green shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {section.privacy && (
                <p className="text-gray-700 leading-relaxed">
                  O tratamento dos seus dados é descrito na nossa{" "}
                  <Link
                    to="/privacidade"
                    className="font-semibold text-ecg-green underline underline-offset-2 hover:opacity-80"
                  >
                    Política de Privacidade
                  </Link>
                  .
                </p>
              )}
              {section.contact && (
                <p className="text-gray-700 leading-relaxed">
                  <a
                    href="mailto:adm@playecg.app"
                    className="font-semibold text-ecg-green underline underline-offset-2 hover:opacity-80"
                  >
                    adm@playecg.app
                  </a>
                </p>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
