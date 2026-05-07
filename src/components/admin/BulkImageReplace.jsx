import { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from "lucide-react";

// Extrai o indexer do nome do arquivo: "ECG_123_456.jpg" → "ECG_123_456"
function extractIndexer(filename) {
  return filename.replace(/\.[^/.]+$/, ""); // remove extensão
}

export default function BulkImageReplace({ open, onOpenChange, onComplete }) {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null); // null = não iniciou, array = finalizado

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles(selected);
    setResults(null);
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setResults(null);

    // Buscar todas as imagens existentes uma vez
    const allImages = await base44.entities.ECGImage.list();
    const indexerMap = {};
    allImages.forEach(img => {
      if (img.indexer) indexerMap[img.indexer] = img;
    });

    const resultList = [];

    for (const file of files) {
      const indexer = extractIndexer(file.name);
      const existingImage = indexerMap[indexer];

      if (!existingImage) {
        resultList.push({ file: file.name, indexer, status: "not_found", casesUpdated: 0 });
        continue;
      }

      try {
        const oldImageUrl = existingImage.image_url;

        // Upload nova imagem
        const uploadResult = await base44.integrations.Core.UploadFile({ file });
        const newImageUrl = uploadResult.file_url;

        // Atualizar ECGImage
        await base44.entities.ECGImage.update(existingImage.id, { image_url: newImageUrl });

        // Atualizar ECGCases vinculados
        const affectedCases = await base44.entities.ECGCase.filter({ image_url: oldImageUrl });
        if (affectedCases.length > 0) {
          await Promise.all(
            affectedCases.map(c => base44.entities.ECGCase.update(c.id, { image_url: newImageUrl }))
          );
        }

        resultList.push({ file: file.name, indexer, status: "success", casesUpdated: affectedCases.length });
      } catch (err) {
        resultList.push({ file: file.name, indexer, status: "error", error: err.message, casesUpdated: 0 });
      }
    }

    setResults(resultList);
    setProcessing(false);
    if (onComplete) onComplete();
  };

  const handleClose = () => {
    setFiles([]);
    setResults(null);
    onOpenChange(false);
  };

  const successCount = results?.filter(r => r.status === "success").length || 0;
  const notFoundCount = results?.filter(r => r.status === "not_found").length || 0;
  const errorCount = results?.filter(r => r.status === "error").length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-600" />
            Substituição em Massa de Imagens
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Instrução */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <strong>Como funciona:</strong> Selecione os novos arquivos de imagem. O nome de cada arquivo deve ser o <strong>indexador</strong> da imagem que deseja substituir (ex: <code className="bg-blue-100 px-1 rounded">ECG_123456_001.jpg</code> substituirá a imagem com indexador <code className="bg-blue-100 px-1 rounded">ECG_123456_001</code>). Os casos vinculados são atualizados automaticamente.
          </div>

          {/* Seleção de arquivos */}
          {!results && (
            <div>
              <label
                htmlFor="bulk-replace-input"
                className="flex flex-col items-center justify-center border-2 border-dashed border-orange-300 rounded-xl p-8 cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-colors"
              >
                <Upload className="w-10 h-10 text-orange-400 mb-2" />
                <p className="font-medium text-gray-700">Clique para selecionar as imagens</p>
                <p className="text-xs text-gray-500 mt-1">Múltiplos arquivos permitidos</p>
                {files.length > 0 && (
                  <Badge className="mt-3 bg-orange-100 text-orange-800">
                    {files.length} arquivo(s) selecionado(s)
                  </Badge>
                )}
              </label>
              <input
                id="bulk-replace-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {/* Lista de arquivos selecionados (antes de processar) */}
          {files.length > 0 && !results && (
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-gray-700 truncate">{f.name}</span>
                  <span className="text-gray-400 ml-2 shrink-0">→ <code>{extractIndexer(f.name)}</code></span>
                </div>
              ))}
            </div>
          )}

          {/* Resultados */}
          {results && (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                {successCount > 0 && <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle2 className="w-3 h-3" />{successCount} substituída(s)</Badge>}
                {notFoundCount > 0 && <Badge className="bg-yellow-100 text-yellow-800 gap-1"><AlertTriangle className="w-3 h-3" />{notFoundCount} não encontrada(s)</Badge>}
                {errorCount > 0 && <Badge className="bg-red-100 text-red-800 gap-1"><XCircle className="w-3 h-3" />{errorCount} erro(s)</Badge>}
              </div>

              <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 px-4 py-2.5 text-sm ${
                    r.status === "success" ? "bg-green-50" :
                    r.status === "not_found" ? "bg-yellow-50" : "bg-red-50"
                  }`}>
                    {r.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />}
                    {r.status === "not_found" && <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />}
                    {r.status === "error" && <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.file}</p>
                      <p className="text-xs text-gray-500">
                        {r.status === "success" && `✅ Substituída — ${r.casesUpdated} caso(s) atualizado(s)`}
                        {r.status === "not_found" && `⚠️ Indexador "${r.indexer}" não encontrado no banco`}
                        {r.status === "error" && `❌ Erro: ${r.error}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={processing}>
              {results ? "Fechar" : "Cancelar"}
            </Button>
            {!results && (
              <Button
                onClick={handleProcess}
                disabled={files.length === 0 || processing}
                className="bg-orange-600 hover:bg-orange-700 gap-2"
              >
                {processing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Processando...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" />Substituir {files.length} imagem(ns)</>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}