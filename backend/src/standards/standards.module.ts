import { Module } from '@nestjs/common'
import { AasMapperService } from './aas/aas-mapper.service'
import { AasImporterService } from './aas/aas-importer.service'
import { AasController } from './aas/aas.controller'
import { AasSubmodelsService } from './aas/submodels.service'
import { AasSubmodelsController } from './aas/submodels.controller'
import { AasServerClient } from './aas/aas-server.client'
import { DtdlExporterService } from './dtdl/dtdl-exporter.service'
import { DtdlImporterService } from './dtdl/dtdl-importer.service'
import { DtdlController } from './dtdl/dtdl.controller'
import { AmlExporterService } from './aml/aml-exporter.service'
import { AmlImporterService } from './aml/aml-importer.service'
import { AmlController } from './aml/aml.controller'
import { StandardsDocsController } from './standards-docs.controller'
import { MachinesModule } from '@/machines/machines.module'

@Module({
  imports: [MachinesModule],
  providers: [
    AasMapperService, AasImporterService, AasSubmodelsService, AasServerClient,
    DtdlExporterService, DtdlImporterService,
    AmlExporterService, AmlImporterService,
  ],
  controllers: [
    AasController, AasSubmodelsController, DtdlController, AmlController,
    StandardsDocsController,
  ],
  exports: [AasMapperService, AasImporterService, AasSubmodelsService, AasServerClient,
    DtdlExporterService, DtdlImporterService, AmlExporterService, AmlImporterService],
})
export class StandardsModule {}
