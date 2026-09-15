import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Plus,
  Search,
  Building2,
  User,
  Phone,
  Mail,
  Instagram,
  Trash2,
  Pencil,
  Clock,
  Save,
  X,
} from "lucide-react";
import { format } from "date-fns";

// Etapas do funil, na ordem em que aparecem no Kanban. Ajustar aqui muda a
// ordem e os rótulos em todo o painel — os valores (id) são o que fica salvo
// no banco (Partner.stage) e não devem mudar sem migrar os registros.
const STAGES = [
  { id: "new_contact", label: "Novo contato", headerClass: "bg-slate-50 border-slate-300 text-slate-700" },
  { id: "talking", label: "Conversando", headerClass: "bg-blue-50 border-blue-300 text-blue-700" },
  { id: "proposal_sent", label: "Proposta enviada", headerClass: "bg-amber-50 border-amber-300 text-amber-700" },
  { id: "negotiation", label: "Negociação", headerClass: "bg-purple-50 border-purple-300 text-purple-700" },
  { id: "won", label: "Fechado", headerClass: "bg-green-50 border-green-300 text-green-700" },
  { id: "lost", label: "Perdido", headerClass: "bg-red-50 border-red-300 text-red-700" },
];

const CATEGORY_LABEL = {
  influencer: "Influenciador",
  academic_league: "Liga acadêmica",
  prep_course: "Curso preparatório",
  medical_school: "Escola médica",
  other: "Outro",
};

const CATEGORY_BADGE_CLASS = {
  influencer: "bg-pink-100 text-pink-700",
  academic_league: "bg-blue-100 text-blue-700",
  prep_course: "bg-amber-100 text-amber-700",
  medical_school: "bg-emerald-100 text-emerald-700",
  other: "bg-gray-100 text-gray-700",
};

const INTERACTION_TYPE_LABEL = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  meeting: "Reunião",
  instagram: "Instagram",
  other: "Outro",
};

const PARTNER_FORM_PADRAO = {
  name: "",
  kind: "institution",
  category: "influencer",
  category_other: "",
  stage: "new_contact",
  notes: "",
  phone: "",
  email: "",
  instagram: "",
};

const CONTACT_FORM_PADRAO = {
  name: "",
  role: "",
  phone: "",
  email: "",
  instagram: "",
  notes: "",
  is_primary: false,
};

// datetime-local espera 'YYYY-MM-DDTHH:mm' em horário local — toISOString()
// devolve UTC, então não dá para usar direto ou o campo mostraria a hora errada.
function agoraParaInputLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function isoParaInputLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const INTERACTION_FORM_PADRAO = () => ({
  occurred_at: agoraParaInputLocal(),
  type: "call",
  notes: "",
});

export default function AdminPartnerships() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [formData, setFormData] = useState(PARTNER_FORM_PADRAO);
  const [savingPartner, setSavingPartner] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState(CONTACT_FORM_PADRAO);
  const [editingContactId, setEditingContactId] = useState(null);

  const [interactions, setInteractions] = useState([]);
  const [interactionForm, setInteractionForm] = useState(INTERACTION_FORM_PADRAO());
  const [editingInteractionId, setEditingInteractionId] = useState(null);

  useEffect(() => {
    checkAdmin();
  }, []);

  const avisar = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 8000);
  };

  const mensagemDoErro = (error, padrao) =>
    error?.response?.data?.error || error?.message || padrao;

  const checkAdmin = async () => {
    const userData = await base44.auth.me();
    if (userData.role !== "admin") {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    setUser(userData);
    await loadPartners();
    setLoading(false);
  };

  const loadPartners = async () => {
    const res = await base44.functions.invoke("adminPartners", { action: "listPartners" });
    setPartners(res?.data?.partners || []);
  };

  const partnersPorEtapa = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const filtrados = termo
      ? partners.filter((p) => (p.name || "").toLowerCase().includes(termo))
      : partners;

    const grupos = {};
    STAGES.forEach((s) => { grupos[s.id] = []; });
    filtrados.forEach((p) => {
      const etapa = STAGES.some((s) => s.id === p.stage) ? p.stage : "new_contact";
      grupos[etapa].push(p);
    });
    return grupos;
  }, [partners, search]);

  // --- Dialog: abrir/fechar --------------------------------------------

  const openCreateDialog = () => {
    setEditingPartner(null);
    setFormData(PARTNER_FORM_PADRAO);
    setContacts([]);
    setInteractions([]);
    setContactForm(CONTACT_FORM_PADRAO);
    setEditingContactId(null);
    setInteractionForm(INTERACTION_FORM_PADRAO());
    setEditingInteractionId(null);
    setShowDialog(true);
  };

  const openEditDialog = async (partner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name || "",
      kind: partner.kind || "institution",
      category: partner.category || "influencer",
      category_other: partner.category_other || "",
      stage: partner.stage || "new_contact",
      notes: partner.notes || "",
      phone: partner.phone || "",
      email: partner.email || "",
      instagram: partner.instagram || "",
    });
    setContactForm(CONTACT_FORM_PADRAO);
    setEditingContactId(null);
    setInteractionForm(INTERACTION_FORM_PADRAO());
    setEditingInteractionId(null);
    setShowDialog(true);
    await Promise.all([loadContacts(partner.id), loadInteractions(partner.id)]);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingPartner(null);
  };

  // --- Partner (dados) ----------------------------------------------------

  const loadContacts = async (partnerId) => {
    const res = await base44.functions.invoke("adminPartners", {
      action: "listContacts",
      partner_id: partnerId,
    });
    setContacts(res?.data?.contacts || []);
  };

  const loadInteractions = async (partnerId) => {
    const res = await base44.functions.invoke("adminPartners", {
      action: "listInteractions",
      partner_id: partnerId,
    });
    setInteractions(res?.data?.interactions || []);
  };

  const partnerValido =
    formData.name.trim().length > 0 &&
    (formData.category !== "other" || formData.category_other.trim().length > 0) &&
    (formData.kind !== "person" || formData.notes.trim().length > 0);

  const handleSavePartner = async () => {
    if (!partnerValido) return;
    setSavingPartner(true);
    const payload = {
      ...formData,
      name: formData.name.trim(),
      category_other: formData.category === "other" ? formData.category_other.trim() : null,
    };
    try {
      if (editingPartner) {
        const res = await base44.functions.invoke("adminPartners", {
          action: "updatePartner",
          id: editingPartner.id,
          data: payload,
        });
        setEditingPartner(res?.data?.partner || editingPartner);
        avisar("success", "Dados salvos.");
      } else {
        const res = await base44.functions.invoke("adminPartners", {
          action: "createPartner",
          data: payload,
        });
        setEditingPartner(res?.data?.partner || null);
        avisar("success", "Parceiro criado. Agora dá para adicionar contatos e histórico.");
      }
      await loadPartners();
    } catch (error) {
      avisar("error", mensagemDoErro(error, "Não foi possível salvar o parceiro."));
    } finally {
      setSavingPartner(false);
    }
  };

  const handleDeletePartner = async (partner) => {
    if (!confirm(`Excluir "${partner.name}"? Isso também apaga os contatos e o histórico dele.`)) return;
    try {
      await base44.functions.invoke("adminPartners", { action: "deletePartner", id: partner.id });
      if (editingPartner?.id === partner.id) closeDialog();
      await loadPartners();
    } catch (error) {
      avisar("error", mensagemDoErro(error, "Não foi possível excluir o parceiro."));
    }
  };

  // --- Drag and drop (Kanban) ---------------------------------------------

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const novaEtapa = destination.droppableId;
    const partnerId = draggableId;
    const anterior = partners;
    setPartners((prev) => prev.map((p) => (String(p.id) === partnerId ? { ...p, stage: novaEtapa } : p)));

    try {
      await base44.functions.invoke("adminPartners", {
        action: "updatePartner",
        id: partnerId,
        data: { stage: novaEtapa },
      });
    } catch (error) {
      setPartners(anterior);
      avisar("error", mensagemDoErro(error, "Não foi possível mover o parceiro de etapa."));
    }
  };

  // --- Contatos -------------------------------------------------------

  const handleEditContact = (contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name || "",
      role: contact.role || "",
      phone: contact.phone || "",
      email: contact.email || "",
      instagram: contact.instagram || "",
      notes: contact.notes || "",
      is_primary: !!contact.is_primary,
    });
  };

  const handleCancelContact = () => {
    setEditingContactId(null);
    setContactForm(CONTACT_FORM_PADRAO);
  };

  const handleSaveContact = async () => {
    if (!editingPartner || !contactForm.name.trim()) return;
    try {
      if (editingContactId) {
        await base44.functions.invoke("adminPartners", {
          action: "updateContact",
          id: editingContactId,
          data: contactForm,
        });
      } else {
        await base44.functions.invoke("adminPartners", {
          action: "createContact",
          data: { ...contactForm, partner_id: editingPartner.id },
        });
      }
      handleCancelContact();
      await loadContacts(editingPartner.id);
    } catch (error) {
      avisar("error", mensagemDoErro(error, "Não foi possível salvar o contato."));
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!confirm("Excluir este contato?")) return;
    try {
      await base44.functions.invoke("adminPartners", { action: "deleteContact", id: contactId });
      await loadContacts(editingPartner.id);
    } catch (error) {
      avisar("error", mensagemDoErro(error, "Não foi possível excluir o contato."));
    }
  };

  // --- Histórico de interações ---------------------------------------

  const handleEditInteraction = (interaction) => {
    setEditingInteractionId(interaction.id);
    setInteractionForm({
      occurred_at: isoParaInputLocal(interaction.occurred_at),
      type: interaction.type || "call",
      notes: interaction.notes || "",
    });
  };

  const handleCancelInteraction = () => {
    setEditingInteractionId(null);
    setInteractionForm(INTERACTION_FORM_PADRAO());
  };

  const handleSaveInteraction = async () => {
    if (!editingPartner || !interactionForm.notes.trim() || !interactionForm.occurred_at) return;
    const payload = {
      ...interactionForm,
      occurred_at: new Date(interactionForm.occurred_at).toISOString(),
      notes: interactionForm.notes.trim(),
    };
    try {
      if (editingInteractionId) {
        await base44.functions.invoke("adminPartners", {
          action: "updateInteraction",
          id: editingInteractionId,
          data: payload,
        });
      } else {
        await base44.functions.invoke("adminPartners", {
          action: "createInteraction",
          data: { ...payload, partner_id: editingPartner.id },
        });
      }
      handleCancelInteraction();
      await loadInteractions(editingPartner.id);
    } catch (error) {
      avisar("error", mensagemDoErro(error, "Não foi possível salvar a interação."));
    }
  };

  const handleDeleteInteraction = async (interactionId) => {
    if (!confirm("Excluir este registro do histórico?")) return;
    try {
      await base44.functions.invoke("adminPartners", { action: "deleteInteraction", id: interactionId });
      await loadInteractions(editingPartner.id);
    } catch (error) {
      avisar("error", mensagemDoErro(error, "Não foi possível excluir o registro."));
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">CRM de Parcerias</h1>
            <p className="text-gray-500 mt-1">
              Acompanhe influenciadores, ligas, cursos e outras parcerias em prospecção
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome..."
                className="pl-9 w-56"
              />
            </div>
            <Button onClick={openCreateDialog} className="bg-purple-600 hover:bg-purple-700 gap-2">
              <Plus className="w-5 h-5" />
              Novo Parceiro
            </Button>
          </div>
        </div>

        {message && (
          <div
            className={`p-4 rounded-lg border text-sm ${
              message.type === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const cards = partnersPorEtapa[stage.id] || [];
              return (
                <div key={stage.id} className="w-[280px] flex-shrink-0">
                  <div className={`rounded-t-xl border px-3 py-2 flex items-center justify-between ${stage.headerClass}`}>
                    <span className="font-semibold text-sm">{stage.label}</span>
                    <span className="text-xs font-medium opacity-70">{cards.length}</span>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[120px] p-2 space-y-2 rounded-b-xl border border-t-0 ${
                          snapshot.isDraggingOver ? "bg-purple-50/60" : "bg-gray-50"
                        }`}
                      >
                        {cards.map((partner, index) => (
                          <Draggable key={partner.id} draggableId={String(partner.id)} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                onClick={() => openEditDialog(partner)}
                                className={`bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow ${
                                  dragSnapshot.isDragging ? "shadow-lg ring-2 ring-purple-300" : "shadow-sm"
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  {partner.kind === "institution" ? (
                                    <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  ) : (
                                    <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  )}
                                  <p className="font-semibold text-sm text-gray-900 leading-snug break-words">
                                    {partner.name}
                                  </p>
                                </div>
                                <Badge
                                  className={`mt-2 text-xs ${CATEGORY_BADGE_CLASS[partner.category] || CATEGORY_BADGE_CLASS.other}`}
                                >
                                  {partner.category === "other" && partner.category_other
                                    ? partner.category_other
                                    : CATEGORY_LABEL[partner.category] || "—"}
                                </Badge>
                                {(partner.phone || partner.email) && (
                                  <div className="mt-2 space-y-1">
                                    {partner.phone && (
                                      <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                                        <Phone className="w-3 h-3 flex-shrink-0" /> {partner.phone}
                                      </p>
                                    )}
                                    {partner.email && (
                                      <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                                        <Mail className="w-3 h-3 flex-shrink-0" /> {partner.email}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {cards.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-6">Arraste um card para cá</p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>

        {partners.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Nenhum parceiro cadastrado</h3>
              <p className="text-gray-600 mb-4">
                Cadastre influenciadores, ligas acadêmicas, cursos e outras parcerias em prospecção
              </p>
              <Button onClick={openCreateDialog} className="bg-purple-600 hover:bg-purple-700">
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Parceiro
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Dialog de detalhe/edição */}
        <Dialog open={showDialog} onOpenChange={(open) => (open ? null : closeDialog())}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {formData.kind === "institution" ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                {editingPartner ? editingPartner.name : "Novo Parceiro"}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="dados" className="w-full">
              <TabsList>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="contatos" disabled={!editingPartner || formData.kind !== "institution"}>
                  Contatos
                </TabsTrigger>
                <TabsTrigger value="historico" disabled={!editingPartner}>
                  Histórico
                </TabsTrigger>
              </TabsList>

              {/* --- Dados --- */}
              <TabsContent value="dados" className="space-y-4 pt-2">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome da instituição ou da pessoa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de cadastro *</Label>
                    <Select
                      value={formData.kind}
                      onValueChange={(value) => setFormData({ ...formData, kind: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="institution">Instituição (tem pessoas de contato)</SelectItem>
                        <SelectItem value="person">Pessoa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.category === "other" && (
                    <div className="space-y-2">
                      <Label>Qual? *</Label>
                      <Input
                        value={formData.category_other}
                        onChange={(e) => setFormData({ ...formData, category_other: e.target.value })}
                        placeholder="Descreva o tipo de parceria"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Etapa do funil</Label>
                  <Select
                    value={formData.stage}
                    onValueChange={(value) => setFormData({ ...formData, stage: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="contato@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instagram</Label>
                    <Input
                      value={formData.instagram}
                      onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                      placeholder="sem o @"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    Observações{formData.kind === "person" ? " *" : ""}
                  </Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={
                      formData.kind === "person"
                        ? "Contexto sobre esta pessoa: como chegou até nós, interesses, combinados..."
                        : "Observações gerais sobre esta parceria"
                    }
                    rows={4}
                  />
                </div>

                <div className="flex justify-between items-center pt-2">
                  {editingPartner ? (
                    <Button
                      variant="outline"
                      onClick={() => handleDeletePartner(editingPartner)}
                      className="text-red-600 hover:text-red-700 gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir parceiro
                    </Button>
                  ) : <span />}
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={closeDialog}>Fechar</Button>
                    <Button
                      onClick={handleSavePartner}
                      disabled={!partnerValido || savingPartner}
                      className="bg-purple-600 hover:bg-purple-700 gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {savingPartner ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* --- Contatos --- */}
              <TabsContent value="contatos" className="space-y-4 pt-2">
                {editingPartner && formData.kind === "institution" && (
                  <>
                    <div className="space-y-2">
                      {contacts.length === 0 && (
                        <p className="text-sm text-gray-500">Nenhum contato cadastrado ainda.</p>
                      )}
                      {contacts.map((contact) => (
                        <div key={contact.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm text-gray-900 flex items-center gap-2">
                                {contact.name}
                                {contact.is_primary && (
                                  <Badge className="bg-purple-100 text-purple-700 text-[10px]">Principal</Badge>
                                )}
                              </p>
                              {contact.role && <p className="text-xs text-gray-500">{contact.role}</p>}
                              <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-600">
                                {contact.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</span>}
                                {contact.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{contact.email}</span>}
                                {contact.instagram && <span className="flex items-center gap-1"><Instagram className="w-3 h-3" />{contact.instagram}</span>}
                              </div>
                              {contact.notes && <p className="text-xs text-gray-500 mt-1">{contact.notes}</p>}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => handleEditContact(contact)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(contact.id)} className="text-red-600 hover:text-red-700">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-purple-50/60 border border-purple-200 rounded-lg space-y-3">
                      <p className="text-sm font-semibold text-purple-900">
                        {editingContactId ? "Editar contato" : "Adicionar contato"}
                      </p>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input
                          value={contactForm.name}
                          onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                          placeholder="Nome *"
                        />
                        <Input
                          value={contactForm.role}
                          onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                          placeholder="Cargo"
                        />
                      </div>
                      <div className="grid md:grid-cols-3 gap-3">
                        <Input
                          value={contactForm.phone}
                          onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                          placeholder="Telefone"
                        />
                        <Input
                          value={contactForm.email}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          placeholder="E-mail"
                        />
                        <Input
                          value={contactForm.instagram}
                          onChange={(e) => setContactForm({ ...contactForm, instagram: e.target.value })}
                          placeholder="Instagram"
                        />
                      </div>
                      <Textarea
                        value={contactForm.notes}
                        onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                        placeholder="Observações sobre esta pessoa"
                        rows={2}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={contactForm.is_primary}
                            onCheckedChange={(checked) => setContactForm({ ...contactForm, is_primary: checked })}
                          />
                          <Label className="text-sm">Contato principal</Label>
                        </div>
                        <div className="flex gap-2">
                          {editingContactId && (
                            <Button variant="outline" size="sm" onClick={handleCancelContact}>
                              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={handleSaveContact}
                            disabled={!contactForm.name.trim()}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            <Save className="w-3.5 h-3.5 mr-1" />
                            {editingContactId ? "Salvar" : "Adicionar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={closeDialog}>Fechar</Button>
                </div>
              </TabsContent>

              {/* --- Histórico --- */}
              <TabsContent value="historico" className="space-y-4 pt-2">
                {editingPartner && (
                  <>
                    <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg space-y-3">
                      <p className="text-sm font-semibold text-blue-900">
                        {editingInteractionId ? "Editar registro" : "Registrar nova interação"}
                      </p>
                      <div className="grid md:grid-cols-2 gap-3">
                        <Input
                          type="datetime-local"
                          value={interactionForm.occurred_at}
                          onChange={(e) => setInteractionForm({ ...interactionForm, occurred_at: e.target.value })}
                        />
                        <Select
                          value={interactionForm.type}
                          onValueChange={(value) => setInteractionForm({ ...interactionForm, type: value })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(INTERACTION_TYPE_LABEL).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Textarea
                        value={interactionForm.notes}
                        onChange={(e) => setInteractionForm({ ...interactionForm, notes: e.target.value })}
                        placeholder="O que foi falado ou combinado?"
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        {editingInteractionId && (
                          <Button variant="outline" size="sm" onClick={handleCancelInteraction}>
                            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={handleSaveInteraction}
                          disabled={!interactionForm.notes.trim() || !interactionForm.occurred_at}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Save className="w-3.5 h-3.5 mr-1" />
                          {editingInteractionId ? "Salvar" : "Registrar"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {interactions.length === 0 && (
                        <p className="text-sm text-gray-500">Nenhuma interação registrada ainda.</p>
                      )}
                      {interactions.map((it) => (
                        <div key={it.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs text-gray-500 flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                {format(new Date(it.occurred_at), "dd/MM/yyyy HH:mm")}
                                <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                                  {INTERACTION_TYPE_LABEL[it.type] || it.type}
                                </Badge>
                              </p>
                              <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{it.notes}</p>
                              {it.created_by && (
                                <p className="text-[11px] text-gray-400 mt-1">registrado por {it.created_by}</p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => handleEditInteraction(it)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteInteraction(it.id)} className="text-red-600 hover:text-red-700">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={closeDialog}>Fechar</Button>
                </div>
              </TabsContent>
            </Tabs>

            {message && (
              <div
                className={`p-3 rounded-lg border text-sm ${
                  message.type === "error"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-green-50 border-green-200 text-green-800"
                }`}
              >
                {message.text}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
