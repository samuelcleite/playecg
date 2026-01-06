import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Calendar,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Sparkles
} from "lucide-react";
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function AdminDailyCases() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [dailyCases, setDailyCases] = useState([]);
  const [ecgCases, setEcgCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingCase, setEditingCase] = useState(null);
  const [formData, setFormData] = useState({
    date: '',
    ecg_case_id: '',
    detailed_explanation: '',
    active: true
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== 'admin') {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    const [cases, ecgs] = await Promise.all([
      base44.entities.DailyCase.list('-date'),
      base44.entities.ECGCase.list()
    ]);
    setDailyCases(cases);
    setEcgCases(ecgs);
    setLoading(false);
  };

  const handleOpenDialog = (dailyCase = null) => {
    if (dailyCase) {
      setEditingCase(dailyCase);
      setFormData({
        date: dailyCase.date,
        ecg_case_id: dailyCase.ecg_case_id,
        detailed_explanation: dailyCase.detailed_explanation,
        active: dailyCase.active
      });
    } else {
      setEditingCase(null);
      setFormData({
        date: '',
        ecg_case_id: '',
        detailed_explanation: '',
        active: true
      });
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.date || !formData.ecg_case_id || !formData.detailed_explanation) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    setSaving(true);
    try {
      if (editingCase) {
        await base44.entities.DailyCase.update(editingCase.id, formData);
      } else {
        await base44.entities.DailyCase.create(formData);
      }
      await loadData();
      setShowDialog(false);
    } catch (error) {
      console.error("Error saving daily case:", error);
      alert("Erro ao salvar caso do dia");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Tem certeza que deseja remover este caso do dia?")) return;

    try {
      await base44.entities.DailyCase.delete(id);
      await loadData();
    } catch (error) {
      console.error("Error deleting daily case:", error);
      alert("Erro ao remover caso do dia");
    }
  };

  const getEcgCaseTitle = (ecgCaseId) => {
    const ecgCase = ecgCases.find(c => c.id === ecgCaseId);
    return ecgCase ? ecgCase.title : 'Caso não encontrado';
  };

  const filteredCases = dailyCases.filter(dc => {
    if (!searchTerm) return true;
    const ecgCase = ecgCases.find(c => c.id === dc.ecg_case_id);
    return (
      dc.date.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ecgCase && ecgCase.title.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-purple-600" />
              Gerenciar Casos do Dia
            </h1>
            <p className="text-gray-500 mt-1">
              Configure os casos diários com explicações detalhadas
            </p>
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar Caso do Dia
          </Button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total de Casos</p>
                  <p className="text-3xl font-bold text-gray-900">{dailyCases.length}</p>
                </div>
                <Calendar className="w-12 h-12 text-purple-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Casos Ativos</p>
                  <p className="text-3xl font-bold text-green-600">
                    {dailyCases.filter(c => c.active).length}
                  </p>
                </div>
                <Calendar className="w-12 h-12 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Casos Futuros</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {dailyCases.filter(c => new Date(c.date) > new Date()).length}
                  </p>
                </div>
                <Calendar className="w-12 h-12 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por data ou título do caso..."
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Cases List */}
        <Card>
          <CardHeader>
            <CardTitle>Casos Programados</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredCases.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum caso do dia cadastrado</p>
                <Button
                  onClick={() => handleOpenDialog()}
                  className="mt-4 bg-purple-600 hover:bg-purple-700"
                >
                  Adicionar Primeiro Caso
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCases.map((dailyCase) => {
                  const isPast = new Date(dailyCase.date) < new Date();
                  const isToday = new Date(dailyCase.date).toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={dailyCase.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`${
                              isToday 
                                ? 'bg-purple-100 text-purple-800 border-purple-300'
                                : isPast
                                  ? 'bg-gray-100 text-gray-800'
                                  : 'bg-blue-100 text-blue-800'
                            }`}>
                              {new Date(dailyCase.date).toLocaleDateString('pt-BR')}
                            </Badge>
                            {isToday && (
                              <Badge className="bg-purple-500 text-white">Hoje</Badge>
                            )}
                            {!dailyCase.active && (
                              <Badge variant="outline" className="text-gray-500">Inativo</Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-900 mb-1">
                            {getEcgCaseTitle(dailyCase.ecg_case_id)}
                          </h3>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {dailyCase.detailed_explanation.replace(/<[^>]*>/g, '').substring(0, 150)}...
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleOpenDialog(dailyCase)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDelete(dailyCase.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCase ? 'Editar Caso do Dia' : 'Adicionar Caso do Dia'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Data *
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Caso de ECG *
              </label>
              <Select
                value={formData.ecg_case_id}
                onValueChange={(value) => setFormData({ ...formData, ecg_case_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um caso" />
                </SelectTrigger>
                <SelectContent>
                  {ecgCases.map((ecgCase) => (
                    <SelectItem key={ecgCase.id} value={ecgCase.id}>
                      {ecgCase.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Explicação Detalhada *
              </label>
              <ReactQuill
                value={formData.detailed_explanation}
                onChange={(value) => setFormData({ ...formData, detailed_explanation: value })}
                theme="snow"
                className="bg-white"
                style={{ height: '300px', marginBottom: '50px' }}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700">
                Caso ativo
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}