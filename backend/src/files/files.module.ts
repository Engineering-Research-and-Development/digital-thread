import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FilesService } from './files.service'
import { FilesController } from './files.controller'
import { FsStorageProvider } from './storage/fs.provider'
import { MinioStorageProvider } from './storage/minio.provider'
import { PrismaService } from '@/database/prisma.service'
import { STORAGE_PROVIDER } from './storage/storage.tokens'
import { ManifestService } from './manifest.service'
import { FileAccessRequestsService } from './file-access-requests.service'
import { EventsModule } from '@/events/events.module'

@Module({
  imports: [EventsModule],
  providers: [
    FilesService,
    ManifestService,
    FileAccessRequestsService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const provider = config.get<string>('storage.provider') ?? 'fs'
        if (provider === 'minio') return new MinioStorageProvider(config, prisma)
        return new FsStorageProvider(config, prisma)
      },
    },
  ],
  controllers: [FilesController],
  exports: [FilesService, ManifestService, FileAccessRequestsService, STORAGE_PROVIDER],
})
export class FilesModule {}
