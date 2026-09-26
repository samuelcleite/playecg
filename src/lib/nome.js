// Conserto de nomes gravados corrompidos pelo login do Google.
// -----------------------------------------------------------------------------
// Até 26/09/2026 o googleSignIn lia o id_token byte a byte, e todo acento virava
// dois caracteres: "João" chegava como "JoÃ£o". A correção lá vale para contas
// novas (e conserta a antiga no próximo login com Google); esta função cobre o
// que já está gravado e aparece na tela antes disso — o formulário de perfil
// abria preenchido com o nome estragado.
//
// Só troca quando o texto É uma sequência UTF-8 lida como um caractere por
// byte. Se esses "bytes" não formam UTF-8 válido — um "JOÃO" ou um "José"
// legítimos, por exemplo —, o nome volta exatamente como veio.
// -----------------------------------------------------------------------------

export function repararNome(nome) {
  if (typeof nome !== "string") return nome;

  let temByteAlto = false;
  for (let i = 0; i < nome.length; i++) {
    const c = nome.charCodeAt(i);
    if (c > 0xff) return nome; // já é texto Unicode de verdade
    if (c >= 0x80) temByteAlto = true;
  }
  if (!temByteAlto) return nome;

  try {
    const bytes = Uint8Array.from(nome, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_e) {
    return nome;
  }
}
