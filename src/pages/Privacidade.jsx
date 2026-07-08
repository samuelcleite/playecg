import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "Dados que coletamos",
    items: [
      "Dados de cadastro: nome e e-mail, fornecidos no login (incluindo login via Google e Sign in with Apple).",
      "Dados de uso: progresso nos módulos, resultados de quizzes, pontuação e conquistas, para viabilizar as funcionalidades do app.",
      "Dados de assinatura: informações sobre seu plano e status de assinatura, processadas por nossos parceiros de pagamento (Stripe, na web; Apple, no iOS). Não armazenamos dados de cartão de crédito.",
    ],
  },
  {
    title: "Como usamos os dados",
    paragraphs: [
      "Utilizamos os dados para autenticar seu acesso, salvar seu progresso, gerenciar sua assinatura e melhorar o aplicativo.",
    ],
  },
  {
    title: "Compartilhamento",
    paragraphs: [
      "Não vendemos seus dados. Compartilhamos dados apenas com provedores necessários ao funcionamento do serviço (por exemplo, provedor de infraestrutura, Stripe, Apple e RevenueCat para gestão de assinaturas).",
    ],
  },
  {
    title: "Seus direitos",
    paragraphs: [
      "Você pode acessar, corrigir ou excluir sua conta e seus dados diretamente no aplicativo, na área de perfil. A exclusão da conta remove seus dados pessoais.",
    ],
  },
  {
    title: "Finalidade educacional",
    paragraphs: [
      "O PlayECG é uma ferramenta de ensino. Não é um dispositivo médico e não deve ser usado para diagnóstico ou decisão clínica sobre pacientes reais.",
    ],
  },
  {
    title: "Contato",
    paragraphs: [
      "Para dúvidas sobre esta política ou sobre seus dados, entre em contato: ecgdescomplica@gmail.com",
    ],
    contact: true,
  },
];

export default function Privacidade() {
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
            <ShieldCheck className="w-6 h-6 text-ecg-green" />
          </div>
          <div>
            <h1 className="font-nunito font-black text-2xl text-ecg-midnight leading-tight">
              Política de Privacidade
            </h1>
            <p className="text-sm text-gray-500">
              Última atualização: 8 de julho de 2026
            </p>
          </div>
        </div>

        <p className="text-gray-700 leading-relaxed mb-8">
          O PlayECG é um aplicativo educacional para estudo de eletrocardiograma
          (ECG), destinado a estudantes e profissionais de saúde. Esta política
          descreve como tratamos seus dados.
        </p>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-nunito font-extrabold text-lg text-ecg-midnight mb-3">
                {section.title}
              </h2>
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
              {section.paragraphs?.map((p, idx) =>
                section.contact ? (
                  <p key={idx} className="text-gray-700 leading-relaxed">
                    Para dúvidas sobre esta política ou sobre seus dados, entre
                    em contato:{" "}
                    <a
                      href="mailto:ecgdescomplica@gmail.com"
                      className="font-semibold text-ecg-green underline underline-offset-2 hover:opacity-80"
                    >
                      ecgdescomplica@gmail.com
                    </a>
                  </p>
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