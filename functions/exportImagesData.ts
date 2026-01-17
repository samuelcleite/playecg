import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Buscar todas as imagens e casos
        const ecgImages = await base44.asServiceRole.entities.ECGImage.list();
        const ecgCases = await base44.asServiceRole.entities.ECGCase.list();

        // Criar mapeamento completo
        const imagesData = ecgImages.map(img => {
            // Encontrar casos que usam esta imagem
            const casesUsingImage = ecgCases.filter(c => c.image_url === img.image_url);
            
            return {
                ecgImage_id: img.id,
                image_url: img.image_url,
                description: img.description,
                indexer: img.indexer,
                tags: img.tags || [],
                cases_using_this_image: casesUsingImage.map(c => ({
                    case_id: c.id,
                    case_title: c.title,
                    module_id: c.module_id,
                    phase_id: c.phase_id
                }))
            };
        });

        return Response.json({
            success: true,
            total_images: imagesData.length,
            export_date: new Date().toISOString(),
            images: imagesData
        });
    } catch (error) {
        console.error('Error exporting images data:', error);
        return Response.json({ 
            success: false, 
            error: error.message || 'Erro ao exportar dados' 
        }, { status: 500 });
    }
});