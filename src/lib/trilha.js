// Regra de progressão da trilha, num lugar só.
//
// Vivia dentro da LearningTrail. O Dashboard do redesenho passou a precisar da
// mesma resposta ("qual é a próxima fase?") para o card CONTINUAR, e copiar a
// regra para lá seria abrir mais uma duplicação que pode derivar em silêncio —
// o botão levaria para uma fase e a trilha destacaria outra.
//
// Aqui não entra plano. O único cadeado é o de progressão (módulo anterior
// completo, fase anterior concluída); quem cobra a assinatura é o ModuleDetail,
// ao abrir a fase. Ver README §5, "Onde o conteúdo pago é bloqueado".

export function montarTrilha(modules, phases, userProgress) {
  return modules.map((mod) => {
    const fases = phases
      .filter((p) => p.module_id === mod.id)
      .sort((a, b) => a.order - b.order)
      .map((phase) => ({
        ...phase,
        isDone: userProgress.find((p) => p.phase_id === phase.id)?.status === "completed",
      }));
    const allDone = fases.length > 0 && fases.every((p) => p.isDone);
    return { module: mod, phases: fases, allDone };
  });
}

export function moduloLiberado(trilha, mod) {
  if (mod.order === 1) return true;
  return trilha
    .filter((item) => item.module.order < mod.order)
    .every((item) => item.allDone);
}

// Primeira fase não concluída do primeiro módulo liberado. null = trilha
// concluída (ou vazia).
export function proximaFase(trilha) {
  for (const item of trilha) {
    if (!moduloLiberado(trilha, item.module)) continue;
    const idx = item.phases.findIndex((p) => !p.isDone);
    if (idx !== -1) {
      return { module: item.module, phase: item.phases[idx], indice: idx, total: item.phases.length };
    }
  }
  return null;
}
