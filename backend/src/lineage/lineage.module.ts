import { Module } from '@nestjs/common'
import { LineageController } from './lineage.controller'
import { LineageService } from './lineage.service'
import { FilesModule } from '@/files/files.module'

@Module({
  // FilesModule provides FilesService, used by LineageService.getFullGraph
  // to enrich each file with its cross-iteration usage references.
  imports: [FilesModule],
  controllers: [LineageController],
  providers: [LineageService],
  exports: [LineageService],
})
export class LineageModule {}
