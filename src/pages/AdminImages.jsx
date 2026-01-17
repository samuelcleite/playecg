import { useState, useEffect } from "react";
import { User } from "@/entities/User";
import { ECGImage } from "@/entities/ECGImage";
import { UploadFile } from "@/integrations/Core";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Save,
  Image as ImageIcon,
  Upload,
  Copy,
  Search,
  Loader2,
  Check,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BulkImageUpload from "../components/admin/BulkImageUpload"; // Added import

export default function AdminImages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [images, setImages] = useState([]);
  const [filteredImages, setFilteredImages] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingImage, setEditingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [formData, setFormData] = useState({
    description: "",
    indexer: "", // Keep indexer in formData for editing existing images
    tags: []
  });
  const [showBulkUpload, setShowBulkUpload] = useState(false); // Added state
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    filterImages();
  }, [searchTerm, images]);

  const checkAdmin = async () => {
    const userData = await User.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadImages();
  };

  const loadImages = async () => {
    const imagesData = await ECGImage.list("-created_date");
    setImages(imagesData);
  };

  const filterImages = () => {
    if (!searchTerm.trim()) {
      setFilteredImages(images);
      return;
    }

    const filtered = images.filter(img => 
      img.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.indexer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredImages(filtered);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenDialog = (imageToEdit = null) => {
    if (imageToEdit) {
      setEditingImage(imageToEdit);
      setFormData({
        description: imageToEdit.description || "",
        indexer: imageToEdit.indexer || "",
        tags: imageToEdit.tags || []
      });
      setPreviewUrl(imageToEdit.image_url);
      setSelectedFile(null);
    } else {
      setEditingImage(null);
      setFormData({
        description: "",
        indexer: "", // For new images, indexer will be generated, so start empty
        tags: []
      });
      setPreviewUrl(null);
      setSelectedFile(null);
    }
    setShowDialog(true);
  };

  const generateIndexer = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ECG_${timestamp}_${random}`;
  };

  const handleSave = async () => {
    setUploading(true);

    try {
      let imageUrl = editingImage?.image_url;

      // Se há um novo arquivo, fazer upload
      if (selectedFile) {
        const uploadResult = await UploadFile({ file: selectedFile });
        imageUrl = uploadResult.file_url;
      }

      const imageData = {
        ...formData,
        image_url: imageUrl,
        // If editing, use existing indexer; if creating new, generate one
        indexer: editingImage ? formData.indexer : generateIndexer()
      };

      if (editingImage) {
        await ECGImage.update(editingImage.id, imageData);
      } else {
        await ECGImage.create(imageData);
      }

      setShowDialog(false);
      await loadImages();
    } catch (error) {
      console.error("Erro ao salvar imagem:", error);
      alert("Erro ao salvar imagem. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId) => {
    if (confirm("Tem certeza que deseja excluir esta imagem?")) {
      await ECGImage.delete(imageId);
      await loadImages();
    }
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const addTag = (tag) => {
    if (tag.trim() && !formData.tags.includes(tag.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tag.trim()] });
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData({ 
      ...formData, 
      tags: formData.tags.filter(tag => tag !== tagToRemove) 
    });
  };

  const handleExportImages = async () => {
    setExporting(true);
    try {
      const response = await base44.functions.invoke('exportImagesData', {});
      
      if (response.data.success) {
        // Criar arquivo JSON para download
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { 
          type: 'application/json' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecg-images-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        alert('Erro ao exportar dados: ' + response.data.error);
      }
    } catch (error) {
      console.error('Erro ao exportar:', error);
      alert('Erro ao exportar dados. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Banco de Imagens ECG</h1>
            <p className="text-gray-500 mt-1">Gerencie o repositório de eletrocardiogramas</p>
          </div>
          <div className="flex gap-3"> {/* Added div to group buttons */}
            <Button
              onClick={handleExportImages}
              disabled={exporting}
              variant="outline"
              className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Exportar Dados
                </>
              )}
            </Button>
            <Button
              onClick={() => setShowBulkUpload(true)}
              variant="outline"
              className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50"
            >
              <Upload className="w-5 h-5" />
              Upload em Massa
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="bg-purple-600 hover:bg-purple-700 gap-2"
            >
              <Plus className="w-5 h-5" />
              Nova Imagem
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <Card className="border-none shadow-lg">
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por descrição, indexador ou tags..."
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{images.length}</p>
                <p className="text-sm text-gray-600 mt-1">Total de Imagens</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg">
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{filteredImages.length}</p>
                <p className="text-sm text-gray-600 mt-1">Resultados</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg md:col-span-1 col-span-2">
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">
                  {new Set(images.flatMap(img => img.tags || [])).size}
                </p>
                <p className="text-sm text-gray-600 mt-1">Tags Únicas</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Images Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredImages.map((image) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="p-0">
                    <div className="relative aspect-video bg-gray-100 rounded-t-xl overflow-hidden">
                      <img 
                        src={image.image_url} 
                        alt={image.description}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 right-2">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="bg-white/90 backdrop-blur-sm hover:bg-white"
                          onClick={() => handleCopyUrl(image.image_url)}
                        >
                          {copiedUrl === image.image_url ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="mb-3">
                      <Badge className="bg-purple-100 text-purple-800 mb-2">
                        {image.indexer}
                      </Badge>
                      <p className="text-sm text-gray-700 line-clamp-2">
                        {image.description}
                      </p>
                    </div>
                    
                    {image.tags && image.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {image.tags.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {image.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{image.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDialog(image)}
                        className="flex-1 gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(image.id)}
                        className="flex-1 gap-2 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredImages.length === 0 && (
            <Card className="col-span-full border-none shadow-lg">
              <CardContent className="p-12 text-center">
                <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {searchTerm ? 'Nenhuma imagem encontrada' : 'Nenhuma imagem cadastrada'}
                </h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm 
                    ? 'Tente buscar com outros termos' 
                    : 'Comece adicionando imagens de ECG ao banco de dados'
                  }
                </p>
                {!searchTerm && (
                  <Button onClick={() => handleOpenDialog()} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Primeira Imagem
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                {editingImage ? 'Editar Imagem' : 'Nova Imagem'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Upload Section */}
              <div className="space-y-2">
                <Label>Imagem do ECG</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-purple-500 transition-colors duration-300">
                  {previewUrl ? (
                    <div className="space-y-4">
                      <img 
                        src={previewUrl} 
                        alt="Preview" 
                        className="w-full h-48 object-contain rounded-lg bg-gray-50"
                      />
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById('file-upload').click()}
                        className="w-full"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Trocar Imagem
                      </Button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => document.getElementById('file-upload').click()}
                      className="text-center cursor-pointer"
                    >
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        Clique para fazer upload
                      </p>
                      <p className="text-xs text-gray-500">
                        PNG, JPG ou JPEG (máx. 10MB)
                      </p>
                    </div>
                  )}
                  <input
                    id="file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Indexer Display (only when editing) */}
              {editingImage ? (
                <div className="space-y-2">
                  <Label>Indexador</Label>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm font-mono text-gray-700">{formData.indexer}</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    O indexador é gerado automaticamente e não pode ser alterado
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>ℹ️ Indexador automático:</strong> Um código único será gerado automaticamente ao salvar a imagem
                  </p>
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva os achados principais deste ECG..."
                  rows={4}
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite uma tag e pressione Enter"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.tags.map((tag, index) => (
                      <Badge 
                        key={index} 
                        className="bg-purple-100 text-purple-800 gap-2 cursor-pointer hover:bg-purple-200"
                        onClick={() => removeTag(tag)}
                      >
                        {tag}
                        <span className="text-purple-600">×</span>
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Ex: fibrilação atrial, bloqueio AV, taquicardia, etc.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDialog(false)}
                  disabled={uploading}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave} 
                  className="bg-purple-600 hover:bg-purple-700 gap-2"
                  // For new images, indexer is auto-generated, so don't validate it here.
                  // For editing, indexer is already set.
                  disabled={uploading || !formData.description || (!selectedFile && !editingImage)}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bulk Upload Dialog */}
      <BulkImageUpload
        open={showBulkUpload}
        onOpenChange={setShowBulkUpload}
        onUploadComplete={loadImages}
      />
    </div>
  );
}