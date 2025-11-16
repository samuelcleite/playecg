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
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  X
} from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function BulkImageUpload({ open, onOpenChange, onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setResult(null);
    }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const generateIndexer = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ECG_${timestamp}_${random}`;
  };

  const processUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setProgress(0);
    setResult(null);

    const results = {
      success: [],
      errors: []
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFile(file.name);
      
      try {
        // Upload da imagem
        const uploadResult = await base44.integrations.Core.UploadFile({ file });
        const imageUrl = uploadResult.file_url;

        // Remover extensão do nome do arquivo para usar como descrição
        const fileName = file.name;
        const description = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

        // Criar registro no banco de imagens
        await base44.entities.ECGImage.create({
          image_url: imageUrl,
          description: description,
          indexer: generateIndexer(),
          tags: []
        });

        results.success.push({ name: fileName });
      } catch (error) {
        results.errors.push({ 
          name: file.name,
          error: error.message 
        });
      }

      setProgress(((i + 1) / files.length) * 100);
    }

    setResult(results);
    setUploading(false);
    setCurrentFile("");
    
    if (results.success.length > 0) {
      onUploadComplete?.();
    }
  };

  const handleClose = () => {
    setFiles([]);
    setResult(null);
    setProgress(0);
    setCurrentFile("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-purple-600" />
            Upload em Massa de Imagens
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Instruções */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>Como funciona:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Selecione múltiplas imagens de ECG de uma vez</li>
                <li>O nome do arquivo (sem extensão) será usado como descrição</li>
                <li>Um indexador único será gerado automaticamente</li>
                <li>As tags ficarão vazias (você pode adicionar depois)</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* File Selection */}
          {!uploading && !result && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 transition-colors duration-300">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  id="bulk-image-upload"
                />
                <label 
                  htmlFor="bulk-image-upload" 
                  className="cursor-pointer flex flex-col items-center gap-3"
                >
                  <Upload className="w-12 h-12 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Clique para selecionar imagens
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      PNG, JPG, JPEG - Múltiplas imagens permitidas
                    </p>
                  </div>
                </label>
              </div>

              {/* Preview Selected Files */}
              {files.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">
                      {files.length} imagem(ns) selecionada(s)
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFiles([])}
                      className="text-red-600 hover:text-red-700"
                    >
                      Limpar Todas
                    </Button>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2 border border-purple-100 rounded-lg p-3">
                    {files.map((file, index) => {
                      const fileName = file.name;
                      const description = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
                      
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <ImageIcon className="w-5 h-5 text-purple-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {fileName}
                              </p>
                              <p className="text-xs text-gray-600 truncate">
                                Descrição: {description}
                              </p>
                              <p className="text-xs text-gray-500">
                                {(file.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFile(index)}
                            className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    onClick={processUpload}
                    className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Fazer Upload de {files.length} Imagem(ns)
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Processing */}
          {uploading && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Fazendo upload das imagens...</p>
                  <p className="text-xs text-gray-600 mt-1">
                    Processando: {currentFile}
                  </p>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-gray-600">
                {Math.round(progress)}% concluído
              </p>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {result.success.length > 0 && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <AlertDescription className="text-green-900">
                    <strong>✅ {result.success.length} imagem(ns) enviada(s) com sucesso!</strong>
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
                          <span className="font-medium">{error.name}</span>
                          <div className="text-xs text-red-700 mt-1">{error.error}</div>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button 
                  onClick={handleClose}
                  variant="outline"
                  className="flex-1"
                >
                  Fechar
                </Button>
                {result.success.length > 0 && (
                  <Button 
                    onClick={() => {
                      setFiles([]);
                      setResult(null);
                      setProgress(0);
                    }}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                  >
                    Enviar Mais Imagens
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}