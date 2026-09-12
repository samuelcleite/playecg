// Classes para o HTML que vem do editor do admin (conteúdo, explicação do caso
// do dia, introdução).
//
// Sem o plugin de tipografia do Tailwind — que o projeto não usa — o preflight
// tira marcador de lista e margem de parágrafo, e o texto do editor chega na
// tela como um bloco corrido. O `prose` que aparecia em algumas telas nunca fez
// nada por isso. Aqui as regras voltam, com as variantes arbitrárias.
export const ESTILO_HTML =
  "[&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:font-extrabold [&_strong]:text-ecg-midnight [&_h1]:font-black [&_h2]:font-black [&_h3]:font-extrabold [&_h1]:text-ecg-midnight [&_h2]:text-ecg-midnight [&_h3]:text-ecg-midnight [&_a]:underline [&_img]:my-2 [&_img]:rounded-xl";
