// Página de DIAGNÓSTICO — temporária, não linkada de lugar nenhum.
//
// Existe para ler o estado real do aparelho em vez de deduzir do lado de cá.
// A rolagem mobile se comportou de formas diferentes no Chrome headless, no
// iPhone (Despia) e no Android (Capacitor), e sem os valores reais qualquer
// conserto vira chute.
//
// Apagar quando o assunto da rolagem estiver fechado.
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { isAndroidNativeApp, isIOSNativeApp, isDespiaApp } from "@/utils/platform";

// Mede quanto uma unidade CSS vale de verdade, criando um elemento fora da tela.
function medirCSS(valor) {
  try {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;visibility:hidden;width:1px;height:${valor};`;
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    el.remove();
    return Math.round(h * 100) / 100;
  } catch {
    return "erro";
  }
}

// Mede env(safe-area-inset-*) da mesma forma: o valor computado de um padding.
function medirEnv(lado) {
  try {
    const el = document.createElement("div");
    el.style.cssText = `position:absolute;visibility:hidden;padding-${lado}:env(safe-area-inset-${lado}, 0px);`;
    document.body.appendChild(el);
    const v = getComputedStyle(el)[`padding${lado[0].toUpperCase()}${lado.slice(1)}`];
    el.remove();
    return v;
  } catch {
    return "erro";
  }
}

function medirElemento(rotulo, el) {
  if (!el) return { rotulo, achou: false };
  const cs = getComputedStyle(el);
  return {
    rotulo,
    achou: true,
    height: cs.height,
    minHeight: cs.minHeight,
    overflowY: cs.overflowY,
    overscrollY: cs.overscrollBehaviorY,
    paddingTop: cs.paddingTop,
    offsetHeight: el.offsetHeight,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    rolavel: el.scrollHeight - el.clientHeight > 1 && /auto|scroll/.test(cs.overflowY),
  };
}

export default function Diag() {
  const [dados, setDados] = useState(null);

  const coletar = () => {
    const wrapper = document.querySelector("div.md\\:hidden.flex.flex-col");
    const main = wrapper ? wrapper.querySelector("main") : null;

    setDados({
      plataforma: {
        "Capacitor.getPlatform()": (() => {
          try { return Capacitor.getPlatform(); } catch { return "erro"; }
        })(),
        "Capacitor.isNativePlatform()": (() => {
          try { return String(Capacitor.isNativePlatform()); } catch { return "erro"; }
        })(),
        "window.Capacitor existe": String(typeof window.Capacitor !== "undefined"),
        "isAndroidNativeApp()": String(isAndroidNativeApp()),
        "isIOSNativeApp()": String(isIOSNativeApp()),
        "isDespiaApp()": String(isDespiaApp()),
      },
      unidades: {
        "suporta 100dvh": String(
          typeof CSS !== "undefined" && CSS.supports ? CSS.supports("height: 100dvh") : "CSS.supports ausente"
        ),
        "suporta 100vh": String(
          typeof CSS !== "undefined" && CSS.supports ? CSS.supports("height: 100vh") : "CSS.supports ausente"
        ),
        "100vh mede": medirCSS("100vh") + "px",
        "100dvh mede": medirCSS("100dvh") + "px",
        "window.innerHeight": window.innerHeight + "px",
        "visualViewport.height": window.visualViewport
          ? Math.round(window.visualViewport.height) + "px"
          : "ausente",
      },
      safeArea: {
        top: medirEnv("top"),
        bottom: medirEnv("bottom"),
        left: medirEnv("left"),
        right: medirEnv("right"),
      },
      caixas: [
        medirElemento("html", document.documentElement),
        medirElemento("body", document.body),
        medirElemento("#root", document.getElementById("root")),
        medirElemento("wrapper mobile", wrapper),
        medirElemento("main mobile", main),
      ],
      documentoRola:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
      ua: navigator.userAgent,
    });
  };

  useEffect(() => {
    const t = setTimeout(coletar, 600);
    return () => clearTimeout(t);
  }, []);

  const Bloco = ({ titulo, obj }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{titulo}</div>
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 8, fontSize: 13, padding: "2px 0" }}>
          <span style={{ color: "#555", flex: "0 0 55%" }}>{k}</span>
          <strong style={{ wordBreak: "break-all" }}>{String(v)}</strong>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: 16, fontFamily: "monospace", background: "#fff" }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Diagnóstico</h1>
      <p style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>
        Página temporária. Tire um print desta tela inteira.
      </p>

      <button
        onClick={coletar}
        style={{
          padding: "10px 16px", marginBottom: 18, background: "#0D3B66",
          color: "#fff", border: 0, borderRadius: 8, fontWeight: 700,
        }}
      >
        Medir de novo
      </button>

      {!dados ? (
        <p>medindo…</p>
      ) : (
        <>
          <Bloco titulo="1. Plataforma" obj={dados.plataforma} />
          <Bloco titulo="2. Unidades CSS" obj={dados.unidades} />
          <Bloco titulo="3. Safe area" obj={dados.safeArea} />

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>4. Caixas do layout</div>
            {dados.caixas.map((c) => (
              <div key={c.rotulo} style={{ fontSize: 12, marginBottom: 10, borderLeft: "3px solid #ddd", paddingLeft: 8 }}>
                <div style={{ fontWeight: 700 }}>{c.rotulo}</div>
                {!c.achou ? (
                  <div style={{ color: "#b00" }}>NAO ENCONTRADO</div>
                ) : (
                  <>
                    <div>height={c.height} minHeight={c.minHeight} paddingTop={c.paddingTop}</div>
                    <div>overflowY={c.overflowY} overscrollY={c.overscrollY}</div>
                    <div>
                      offset={c.offsetHeight} scroll={c.scrollHeight} client={c.clientHeight}{" "}
                      <strong style={{ color: c.rolavel ? "#080" : "#b00" }}>
                        {c.rolavel ? "ROLA" : "nao rola"}
                      </strong>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <Bloco
            titulo="5. Documento"
            obj={{
              "quanto o documento pode rolar": dados.documentoRola + "px",
              "scrollY atual": Math.round(window.scrollY) + "px",
            }}
          />

          <div style={{ fontSize: 11, color: "#666", wordBreak: "break-all", marginBottom: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>6. User agent</div>
            {dados.ua}
          </div>
        </>
      )}

      {/* Bloco alto de proposito: serve para testar a rolagem nesta propria tela. */}
      <div style={{ height: 1200, background: "linear-gradient(#eef,#ccd)", padding: 12 }}>
        role para baixo…
      </div>
      <div style={{ padding: 20, background: "#0D3B66", color: "#fff", fontWeight: 800, borderRadius: 8 }}>
        FIM — se você está lendo isto, a rolagem funcionou.
      </div>
    </div>
  );
}
