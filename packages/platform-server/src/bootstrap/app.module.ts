import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { InfraModule } from '../infra/infra.module.js';

@Module({ imports: [CoreModule, InfraModule] })
export class AppModule {
  constructor() {}
}
