import { Module } from '@nestjs/common';
import { TemplateRegistry } from './templateRegistry';
import { PortsRegistry } from './ports.registry';
import { GraphService } from './graphMongo.repository';
import { GitGraphService } from './gitGraph.repository';
import { LiveGraphRuntime } from './liveGraph.manager';
import { GraphGuard } from './graph.guard';

@Module({
  providers: [
    TemplateRegistry,
    PortsRegistry,
    GraphService,
    GitGraphService,
    LiveGraphRuntime,
    // Guards
    GraphGuard,
  ],
  exports: [
    GraphGuard,
  ],
})
export class GraphModule {}
