import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAIL = "adm@playecg.app";

const MailLink = () => (
  <a
    href={`mailto:${MAIL}`}
    className="font-semibold text-ecg-green underline underline-offset-2 hover:opacity-80"
  >
    {MAIL}
  </a>
);

const SECTIONS = [
  {
    title: "Antes de excluir: assinaturas ativas",
    content: (
      <>
        <p className="text-gray-700 leading-relaxed mb-3">
          Se você tem uma assinatura ativa contratada pela{" "}
          <strong>App Store</strong> ou pela <strong>Google Play</strong>,
          cancele-a diretamente na loja antes de excluir sua conta. Não
          conseguimos cancelar essas assinaturas por você — apenas o titular pode
          fazer isso, dentro da própria loja.
        </p>
        <ul className="space-y-2 mb-3">
          <li className="flex gap-2.5 text-gray-700 leading-relaxed">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ecg-green shrink-0" />
            <span>
              <strong>iPhone/iPad:</strong> Ajustes → seu nome → Assinaturas →
              PlayECG → Cancelar
            </span>
          </li>
          <li className="flex gap-2.5 text-gray-700 leading-relaxed">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ecg-green shrink-0" />
            <span>
              <strong>Android:</strong> Play Store → menu → Pagamentos e
              assinaturas → Assinaturas → PlayECG → Cancelar
            </span>
          </li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Assinaturas contratadas pelo site são canceladas automaticamente
          durante a exclusão.
        </p>
      </>
    ),
  },
  {
    title: "Como excluir sua conta",
    content: (
      <>
        <h3 className="font-nunito font-bold text-base text-ecg-midnight mb-1">
          Pelo aplicativo
        </h3>
        <p className="text-gray-700 leading-relaxed mb-4">
          Perfil → Zona de Perigo → Deletar Minha Conta. A exclusão é processada
          imediatamente.
        </p>
        <h3 className="font-nunito font-bold text-base text-ecg-midnight mb-1">
          Se você já desinstalou o aplicativo
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Envie um e-mail para <MailLink /> com o assunto "Exclusão de conta", a
          partir do endereço cadastrado no PlayECG. Processamos em até{" "}
          <strong>30 dias</strong>.
        </p>
      </>
    ),
  },
  {
    title: "O que é excluído",
    content: (
      <>
        <p className="text-gray-700 leading-relaxed mb-3">
          Todos os seus dados são apagados de forma permanente e irreversível:
        </p>
        <ul className="space-y-2 mb-3">
          {[
            "Conta e dados cadastrais (nome, e-mail)",
            "Progresso nos módulos",
            "Tentativas e respostas de quiz",
            "Estatísticas diárias",
            "Conquistas, troféus, pontuação e nível",
            "Registros de pagamento",
            "Inscrições de notificação",
          ].map((item) => (
            <li
              key={item}
              className="flex gap-2.5 text-gray-700 leading-relaxed"
            >
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ecg-green shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-gray-700 leading-relaxed">
          Não há período de carência nem possibilidade de recuperação. Não
          oferecemos desativação temporária como alternativa.
        </p>
      </>
    ),
  },
  {
    title: "O que permanece",
    content: (
      <p className="text-gray-700 leading-relaxed">
        Registros de transações mantidos pelos processadores de pagamento
        (Stripe, Apple, Google) seguem as políticas de retenção dessas empresas e
        a legislação fiscal brasileira. Esses registros estão fora do nosso
        controle direto.
      </p>
    ),
  },
  {
    title: "Seus direitos (LGPD)",
    content: (
      <p className="text-gray-700 leading-relaxed">
        A Lei nº 13.709/2018 garante o direito à eliminação dos seus dados
        pessoais. Para exercer esse ou outros direitos, entre em contato:{" "}
        <MailLink />
      </p>
    ),
  },
];

export default function ExcluirConta() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ecg-gray">
      <header
        className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200"
        style={{ paddingTop: "var(--app-safe-top, 0px)" }}
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
            <Trash2 className="w-6 h-6 text-ecg-green" />
          </div>
          <div>
            <h1 className="font-nunito font-black text-2xl text-ecg-midnight leading-tight">
              Exclusão de Conta e Dados
            </h1>
            <p className="text-sm text-gray-500">
              Última atualização: 16 de julho de 2026
            </p>
          </div>
        </div>

        <p className="text-gray-700 leading-relaxed mb-8">
          <span className="font-semibold text-ecg-midnight">
            PLAYECG DESENVOLVIMENTO DE SOFTWARE LTDA
          </span>
          <br />
          CNPJ: 66.792.038/0001-52
        </p>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-nunito font-extrabold text-lg text-ecg-midnight mb-3">
                {section.title}
              </h2>
              {section.content}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
