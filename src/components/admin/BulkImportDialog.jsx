
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Upload, 
  Download, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  FileSpreadsheet
} from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function BulkImportDialog({ 
  open, 
  onOpenChange, 
  entityType, // "Module" ou "Phase"
  onImportComplete,
  modules = [] // Para fases, precisamos dos módulos existentes
}) {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const templateData = {
    Module: {
      columns: ["name", "description", "order", "total_cases", "required_points"],
      example: [
        {
          name: "Ritmo e Frequência Cardíaca",
          description: "Aprenda a identificar ritmos cardíacos e calcular frequências",
          order: 1,
          total_cases: 10,
          required_points: 0
        },
        {
          name: "Eixo Cardíaco e Derivações",
          description: "Entenda o eixo elétrico do coração",
          order: 2,
          total_cases: 15,
          required_points: 100
        }
      ],
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          order: { type: "number" },
          total_cases: { type: "number" },
          required_points: { type: "number" }
        }
      }
    },
    Phase: {
      columns: ["name", "description", "module_name", "order", "total_cases", "required_points"],
      example: [
        {
          name: "Ritmo Sinusal Normal",
          description: "Identificação de ritmo sinusal normal",
          module_name: "Ritmo e Frequência Cardíaca",
          order: 1,
          total_cases: 5,
          required_points: 0
        },
        {
          name: "Taquicardia Sinusal",
          description: "Reconhecer taquicardia sinusal",
          module_name: "Ritmo e Frequência Cardíaca",
          order: 2,
          total_cases: 5,
          required_points: 50
        }
      ],
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          module_name: { type: "string" },
          order: { type: "number" },
          total_cases: { type: "number" },
          required_points: { type: "number" }
        }
      }
    }
  };

  const downloadTemplate = () => {
    const template = templateData[entityType];
    const csv = [
      template.columns.join(","),
      ...template.example.map(row => 
        template.columns.map(col => {
          const value = row[col];
          // Envolver em aspas se contiver vírgula ou quebra de linha
          return typeof value === 'string' && (value.includes(',') || value.includes('\n'))
            ? `"${value}"`
            : value;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }); // BOM para Excel reconhecer UTF-8
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `template_${entityType.toLowerCase()}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const processImport = async () => {
    if (!file) return;

    setProcessing(true);
    setProgress(10);
    setResult(null);

    try {
      // Upload do arquivo
      setProgress(30);
      const uploadResult = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResult.file_url;

      // Extrair dados do arquivo
      setProgress(50);
      const template = templateData[entityType];
      const extractResult = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: fileUrl,
        json_schema: {
          type: "array",
          items: template.schema
        }
      });

      if (extractResult.status === "error") {
        throw new Error(extractResult.details || "Erro ao processar arquivo");
      }

      const data = extractResult.output;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Nenhum dado encontrado no arquivo");
      }

      setProgress(70);

      // Processar dados
      const results = {
        success: [],
        errors: []
      };

      if (entityType === "Module") {
        // Importar módulos
        for (let i = 0; i < data.length; i++) {
          try {
            const moduleData = data[i];
            await base44.entities.Module.create(moduleData);
            results.success.push({ row: i + 2, name: moduleData.name });
          } catch (error) {
            results.errors.push({ 
              row: i + 2, 
              name: data[i].name || "Sem nome",
              error: error.message 
            });
          }
          setProgress(70 + (i / data.length) * 30);
        }
      } else if (entityType === "Phase") {
        // Importar fases - precisamos converter module_name para module_id
        const moduleMap = {};
        modules.forEach(m => {
          moduleMap[m.name] = m.id;
        });

        for (let i = 0; i < data.length; i++) {
          try {
            const phaseData = { ...data[i] };
            const moduleName = phaseData.module_name;
            
            if (!moduleName) {
              throw new Error("Nome do módulo não especificado");
            }

            const moduleId = moduleMap[moduleName];
            if (!moduleId) {
              throw new Error(`Módulo "${moduleName}" não encontrado`);
            }

            delete phaseData.module_name;
            phaseData.module_id = moduleId;

            await base44.entities.Phase.create(phaseData);
            results.success.push({ row: i + 2, name: phaseData.name });
          } catch (error) {
            results.errors.push({ 
              row: i + 2, 
              name: data[i].name || "Sem nome",
              error: error.message 
            });
          }
          setProgress(70 + (i / data.length) * 30);
        }
      }

      setProgress(100);
      setResult(results);
      
      if (results.success.length > 0) {
        onImportComplete?.();
      }
    } catch (error) {
      setResult({
        success: [],
        errors: [{ row: "Geral", name: "Erro de processamento", error: error.message }]
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            Importação em Massa - {entityType === "Module" ? "Módulos" : "Fases"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Instruções */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>Como funciona:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                <li>Baixe o template CSV (pode ser aberto no Excel)</li>
                <li>Preencha os dados seguindo o formato do exemplo</li>
                <li>Salve o arquivo e faça o upload abaixo</li>
                {entityType === "Phase" && (
                  <li className="text-amber-700 font-medium">
                    ⚠️ Use o nome exato do módulo existente na coluna "module_name"
                  </li>
                )}
              </ol>
            </AlertDescription>
          </Alert>

          {/* Download Template */}
          <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div>
              <p className="font-medium text-gray-900">1. Baixar Template</p>
              <p className="text-sm text-gray-600">
                {entityType === "Module" 
                  ? "Template com exemplo de módulos" 
                  : "Template com exemplo de fases"}
              </p>
            </div>
            <Button onClick={downloadTemplate} variant="outline" className="gap-2 border-purple-300">
              <Download className="w-4 h-4" />
              Baixar Template
            </Button>
          </div>

          {/* Upload File */}
          <div className="space-y-3">
            <div>
              <p className="font-medium text-gray-900 mb-2">2. Fazer Upload do Arquivo</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors duration-300">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="bulk-import-file"
                  disabled={processing}
                />
                <label 
                  htmlFor="bulk-import-file" 
                  className="cursor-pointer flex flex-col items-center gap-3"
                >
                  <Upload className="w-10 h-10 text-gray-400" />
                  {file ? (
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {(file.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        Clique para selecionar o arquivo
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        CSV ou Excel (.xlsx, .xls)
                      </p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {file && !processing && !result && (
              <Button 
                onClick={processImport}
                className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
              >
                <Upload className="w-4 h-4" />
                Importar Dados
              </Button>
            )}
          </div>

          {/* Processing */}
          {processing && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <span className="text-sm font-medium">Processando importação...</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {result.success.length > 0 && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <AlertDescription className="text-green-900">
                    <strong>✅ {result.success.length} registro(s) importado(s) com sucesso!</strong>
                    <div className="mt-2 text-sm max-h-32 overflow-y-auto">
                      {result.success.map((item, i) => (
                        <div key={i}>• {item.name}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {result.errors.length > 0 && (
                <Alert className="bg-red-50 border-red-200">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-900">
                    <strong>❌ {result.errors.length} erro(s) encontrado(s):</strong>
                    <div className="mt-2 text-sm max-h-40 overflow-y-auto space-y-2">
                      {result.errors.map((error, i) => (
                        <div key={i} className="bg-white p-2 rounded border border-red-200">
                          <span className="font-medium">Linha {error.row}:</span> {error.name}
                          <div className="text-xs text-red-700 mt-1">{error.error}</div>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button 
                onClick={handleClose}
                variant="outline"
                className="w-full"
              >
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
